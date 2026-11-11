import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  AppState,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  Vibration,
  View,
  type GestureResponderEvent,
} from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "../../components/Button";
import { Atmosphere } from "../../components/reader/Atmosphere";
import { DialogueLog } from "../../components/reader/DialogueLog";
import { ReaderSettingsSheet } from "../../components/reader/ReaderSettingsSheet";
import {
  ReaderToolbar,
  type SkipMode,
  type ToolbarAction,
} from "../../components/reader/ReaderToolbar";
import { StageSprite } from "../../components/reader/StageSprite";
import { useTypewriter } from "../../components/reader/useTypewriter";
import { apiRequest, ApiError } from "../../lib/api";
import { audioEngine } from "../../lib/audio";
import { costLabel, CURRENCY } from "../../lib/currency";
import { t } from "../../lib/locale";
import { autoTapDelayMs, FAST_FORWARD, useReaderSettings } from "../../lib/reader-settings";
import { colors, fonts, radius } from "../../lib/theme";
import type {
  ChoiceOptionView,
  ChoiceView,
  DialogueView,
  EndView,
  PlayView,
} from "../../lib/types";
import { useWalletStore } from "../../lib/wallet-store";

// A tap in this top share of the screen opens the menu instead of advancing the story.
const MENU_ZONE = 0.24;
const MENU_AUTO_HIDE_MS = 6000;

export default function ReadingScreen() {
  const { slotId } = useLocalSearchParams<{ slotId: string }>();
  const settings = useReaderSettings();
  const hydrateSettings = settings.hydrate;
  const refreshWallet = useWalletStore((s) => s.fetch);

  const [view, setView] = useState<PlayView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uiHidden, setUiHidden] = useState(false);
  const [auto, setAuto] = useState(false);
  const [skip, setSkip] = useState<SkipMode>("off");
  const skipping = skip !== "off";
  const [menuOpen, setMenuOpen] = useState(false);
  const [hint, setHint] = useState(false);
  const { height: screenHeight } = useWindowDimensions();
  const [logOpen, setLogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Kept in a ref as well, so timers always act on the view that is on screen right now.
  const viewRef = useRef<PlayView | null>(null);
  const busyRef = useRef(false);

  const boxOpacity = useRef(new Animated.Value(1)).current;
  const shake = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const dip = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const cameraZoom = useRef(new Animated.Value(1)).current;
  const cameraPan = useRef(new Animated.Value(0)).current;

  const fadeBox = useCallback(
    (toValue: number, duration: number) =>
      new Promise<void>((resolve) => {
        Animated.timing(boxOpacity, { toValue, duration, useNativeDriver: true }).start(() =>
          resolve(),
        );
      }),
    [boxOpacity],
  );

  /** Applies everything a freshly received view asks of the stage: music, one-shot
   * sound/screen effects and camera framing. */
  const present = useCallback(
    (received: PlayView, { quiet = false }: { quiet?: boolean } = {}) => {
      // An API older than this app build sends no stage block; treat that as an empty stage
      // (background only) instead of crashing mid-story.
      const next = {
        ...received,
        stage: received.stage ?? {
          backgroundUrl:
            (received as { backgroundImageUrl?: string | null }).backgroundImageUrl ?? null,
          music: null,
          atmosphere: null,
          camera: null,
          cgUrl: null,
        },
        saveSlot: { ...received.saveSlot, canRollback: received.saveSlot.canRollback ?? false },
      } as PlayView;
      viewRef.current = next;
      setView(next);
      const stage = next.stage;
      const s = useReaderSettings.getState();
      audioEngine.syncMusic(stage.music, stage.musicFadeMs ?? 800);
      if (quiet) return; // fast-skipping: keep state in sync, play no one-shot effects
      if (stage.sfxUrl) audioEngine.playSfx(stage.sfxUrl);

      const camera = stage.camera;
      const duration = s.reduceMotion ? 0 : (stage.cameraDurationMs ?? 900);
      Animated.parallel([
        Animated.timing(cameraZoom, {
          toValue: s.reduceMotion ? 1 : (camera?.zoom ?? 1),
          duration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(cameraPan, {
          toValue:
            s.reduceMotion || !camera
              ? 0
              : camera.focus === "left"
                ? 1
                : camera.focus === "right"
                  ? -1
                  : 0,
          duration,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();

      if (stage.transition === "fade" && !s.reduceMotion) {
        dip.setValue(1);
        Animated.timing(dip, { toValue: 0, duration: 520, useNativeDriver: true }).start();
      }
      const effect = stage.screenEffect;
      if (!effect) return;
      if (s.vibration && (effect === "shake" || effect === "heartbeat")) {
        Vibration.vibrate(effect === "shake" ? 60 : [0, 40, 120, 40]);
      }
      if (s.reduceMotion) return;
      if (effect === "shake") {
        Animated.sequence(
          [9, -9, 6, -6, 3, 0].map((x) =>
            Animated.timing(shake, { toValue: x, duration: 50, useNativeDriver: true }),
          ),
        ).start();
      } else if (effect === "flash") {
        flash.setValue(0.85);
        Animated.timing(flash, { toValue: 0, duration: 420, useNativeDriver: true }).start();
      } else if (effect === "heartbeat") {
        Animated.sequence(
          [1.025, 1, 1.018, 1].map((v) =>
            Animated.timing(pulse, { toValue: v, duration: 130, useNativeDriver: true }),
          ),
        ).start();
      } else if (effect === "blur_in") {
        dip.setValue(0.9);
        Animated.timing(dip, {
          toValue: 0,
          duration: 900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      }
    },
    [cameraPan, cameraZoom, dip, flash, pulse, shake],
  );

  const load = useCallback(async () => {
    setError(null);
    try {
      present(await apiRequest<PlayView>(`/play/save-slots/${slotId}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Не удалось загрузить сцену");
    }
  }, [slotId, present]);

  useEffect(() => {
    hydrateSettings();
    load().finally(() => setLoading(false));
  }, [load, hydrateSettings]);

  // Music belongs to this screen: it pauses with the app and stops when the reader closes.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") audioEngine.resume();
      else audioEngine.pause();
    });
    return () => {
      subscription.remove();
      audioEngine.stopAll();
    };
  }, []);

  useEffect(() => {
    audioEngine.setVolumes(settings.musicVolume, settings.sfxVolume);
  }, [settings.musicVolume, settings.sfxVolume]);

  /** Runs one server action. `nodeId` makes it safe to repeat: if the response of an earlier
   * attempt was lost, the server recognises the stale node and just returns where we are. */
  const act = useCallback(
    async (path: string, body: Record<string, unknown>, opts: { quiet?: boolean } = {}) => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      if (!opts.quiet) await fadeBox(0, 110);
      try {
        const next = await apiRequest<PlayView>(`/play/save-slots/${slotId}/${path}`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        present(next, { quiet: opts.quiet });
        return true;
      } catch (err) {
        setAuto(false);
        setSkip("off");
        Alert.alert(
          "Не получилось",
          err instanceof ApiError ? err.message : "Проверьте соединение и попробуйте ещё раз",
        );
        return false;
      } finally {
        if (!opts.quiet) await fadeBox(1, 140);
        else boxOpacity.setValue(1);
        busyRef.current = false;
        setBusy(false);
      }
    },
    [slotId, present, fadeBox, boxOpacity],
  );

  const dialogue = view?.type === "DIALOGUE" ? view : null;
  const fullText = dialogue ? t(dialogue.text) : "";
  const typer = useTypewriter(fullText, skipping ? 0 : settings.textSpeed, dialogue?.nodeId ?? "");

  const advance = useCallback(
    (opts: { quiet?: boolean } = {}) => {
      const current = viewRef.current;
      if (current?.type !== "DIALOGUE" || !current.canAdvance) return;
      act("advance", { nodeId: current.nodeId }, opts);
    },
    [act],
  );

  const onTapStage = (event?: GestureResponderEvent) => {
    if (uiHidden) return setUiHidden(false);
    // The upper part of the screen belongs to the menu: tap to bring it in, tap to dismiss.
    if (event && event.nativeEvent.pageY < screenHeight * MENU_ZONE) {
      setHint(false);
      return setMenuOpen((open) => !open);
    }
    if (menuOpen) return setMenuOpen(false);
    if (skipping) return setSkip("off");
    if (auto) setAuto(false);
    if (!dialogue) return;
    if (!typer.done) return typer.finish();
    advance();
  };

  // The menu leaves by itself, so it never sits over the character's face for long.
  useEffect(() => {
    if (!menuOpen || logOpen || settingsOpen) return;
    const timer = setTimeout(() => setMenuOpen(false), MENU_AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [menuOpen, logOpen, settingsOpen, auto, skip]);

  // Shown once ever: the menu is hidden, so a new reader has to be told where it is.
  // Marking it as seen flips `hintDue` back to false, so the hide timer must not live in
  // this effect's cleanup - it is kept in a ref and cleared only when the screen closes.
  const hintDue = settings.hydrated && !settings.menuHintSeen && !loading;
  const markHintSeen = settings.update;
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!hintDue) return;
    setHint(true);
    markHintSeen({ menuHintSeen: true });
    hintTimer.current = setTimeout(() => setHint(false), 5000);
  }, [hintDue, markHintSeen]);
  useEffect(
    () => () => {
      if (hintTimer.current) clearTimeout(hintTimer.current);
    },
    [],
  );

  const autoDelay = autoTapDelayMs(fullText, settings.autoTapSeconds);
  const autoWaiting =
    auto && Boolean(dialogue?.canAdvance) && typer.done && !busy && !logOpen && !settingsOpen;

  // Auto-tap: once a line is fully shown, wait as long as it takes to read it, then tap.
  useEffect(() => {
    if (auto && dialogue && !dialogue.canAdvance) setAuto(false);
    if (!autoWaiting) return;
    const timer = setTimeout(() => advance(), autoDelay);
    return () => clearTimeout(timer);
  }, [auto, dialogue, autoWaiting, autoDelay, advance]);

  // Fast-forward: lines appear whole and move on at the chosen speed; it stops by itself
  // at the next choice or ending. "Very fast" also skips one-shot effects and fades.
  useEffect(() => {
    if (!skipping || busy) return;
    if (!dialogue || !dialogue.canAdvance) return setSkip("off");
    const timer = setTimeout(() => advance({ quiet: skip === "veryFast" }), FAST_FORWARD[skip]);
    return () => clearTimeout(timer);
  }, [skip, skipping, dialogue, busy, advance]);

  const choose = useCallback(
    async (option: ChoiceOptionView) => {
      const current = viewRef.current;
      if (current?.type !== "CHOICE") return;
      const paid = Boolean(option.costCurrency) && option.costAmount > 0 && !option.owned;
      const ok = await act("choice", { choiceOptionId: option.id, nodeId: current.nodeId });
      if (ok && paid) refreshWallet();
    },
    [act, refreshWallet],
  );

  const confirmAndChoose = (option: ChoiceOptionView) => {
    const paid = Boolean(option.costCurrency) && option.costAmount > 0 && !option.owned;
    if (!paid) return void choose(option);
    const currency = CURRENCY[option.costCurrency ?? "SOFT"].genitive;
    Alert.alert(
      "Платный выбор",
      `«${t(option.text)}»\n\nБудет списано ${option.costAmount} ${currency}. Этот вариант останется вашим: при повторном прохождении платить снова не придётся.`,
      [
        { text: "Отмена", style: "cancel" },
        { text: `Потратить ${option.costAmount}`, onPress: () => void choose(option) },
      ],
    );
  };

  const onToolbar = (action: ToolbarAction) => {
    if (action === "exit") return router.back();
    if (action === "back") {
      setAuto(false);
      setSkip("off");
      act("rollback", {});
    } else if (action === "log") setLogOpen(true);
    else if (action === "settings") setSettingsOpen(true);
    else if (action === "hide") {
      setMenuOpen(false);
      setUiHidden(true);
    } else if (action === "auto") {
      setSkip("off");
      setAuto((v) => !v);
    } else if (action === "skip") {
      setAuto(false);
      // off -> fast -> very fast -> off
      setSkip((mode) => (mode === "off" ? "fast" : mode === "fast" ? "veryFast" : "off"));
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (error || !view) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ headerShown: false }} />
        <Text style={styles.errorText}>{error ?? "Сцена не найдена"}</Text>
        <Button title="Попробовать снова" onPress={load} />
        <Button title="Назад" onPress={() => router.back()} variant="secondary" />
      </View>
    );
  }

  const stage = view.stage;
  const reduceMotion = settings.reduceMotion;
  const panDistance = 46;

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: false }} />

      <Animated.View
        style={[
          styles.world,
          {
            transform: [
              { translateX: Animated.add(shake, Animated.multiply(cameraPan, panDistance)) },
              { scale: Animated.multiply(cameraZoom, pulse) },
            ],
          },
        ]}
      >
        <CrossfadeImage uri={stage.backgroundUrl} instant={reduceMotion || skipping} />
        <View style={styles.scrim} />
        {view.type === "DIALOGUE" && !stage.cgUrl && (
          <View style={styles.stage} pointerEvents="none">
            {view.staged.map((s) => (
              <StageSprite
                key={s.characterId}
                staged={s}
                reduceMotion={reduceMotion || skipping}
                speaking={!view.speaker || view.speaker.id === s.characterId}
              />
            ))}
          </View>
        )}
        <CrossfadeImage uri={stage.cgUrl} instant={reduceMotion || skipping} />
        <Atmosphere kind={stage.atmosphere} reduceMotion={reduceMotion} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.dip, { opacity: dip }]}
      />
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]}
      />

      {/* The whole screen advances the story; controls below sit on top of this layer. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onTapStage}
        accessibilityRole="button"
        accessibilityLabel={uiHidden ? "Вернуть интерфейс" : "Продолжить"}
      />

      {!uiHidden && view.type !== "END" && (auto || skipping) && !menuOpen && (
        <SafeAreaView style={styles.topBar} edges={["top"]} pointerEvents="none">
          <Text style={styles.modeBadge}>
            {skip === "veryFast"
              ? "Перемотка ×2 · коснитесь, чтобы остановить"
              : skipping
                ? "Перемотка · коснитесь, чтобы остановить"
                : "Автоклик"}
          </Text>
        </SafeAreaView>
      )}

      {!uiHidden && view.type !== "END" && hint && !menuOpen && (
        <View style={styles.hint} pointerEvents="none">
          <Text style={styles.hintText}>Коснитесь верхней части экрана, чтобы открыть меню</Text>
        </View>
      )}

      {!uiHidden && view.type !== "END" && menuOpen && (
        <View style={styles.menu} pointerEvents="box-none">
          <ReaderToolbar
            onAction={onToolbar}
            auto={auto}
            skip={skip}
            canGoBack={!busy && view.saveSlot.canRollback}
            canAutoplay={view.type === "DIALOGUE"}
          />
        </View>
      )}

      {!uiHidden && view.type !== "END" && (
        <SafeAreaView style={styles.foreground} edges={["bottom"]} pointerEvents="box-none">
          <Animated.View style={{ opacity: boxOpacity }} pointerEvents="box-none">
            {view.type === "DIALOGUE" && (
              <Pressable style={styles.tapArea} onPress={() => onTapStage()} disabled={busy}>
                <DialogueBox
                  view={view}
                  text={typer.visibleText}
                  fullText={fullText}
                  done={typer.done}
                  autoMs={autoWaiting ? autoDelay : null}
                />
              </Pressable>
            )}
            {view.type === "CHOICE" && (
              <ChoicePanel
                view={view}
                busy={busy}
                paused={logOpen || settingsOpen}
                onChoose={confirmAndChoose}
                onTimeout={(option) => void choose(option)}
              />
            )}
          </Animated.View>
        </SafeAreaView>
      )}

      {view.type === "END" && (
        <EndPanel
          view={view}
          busy={busy}
          onReplay={() => act("restart", {})}
          onNext={async (chapterId) => {
            try {
              const next = await apiRequest<PlayView>(`/play/chapters/${chapterId}/start`, {
                method: "POST",
                body: JSON.stringify({ slotIndex: view.saveSlot.slotIndex }),
              });
              refreshWallet();
              router.replace(`/read/${next.saveSlot.id}`);
              present(next);
            } catch (err) {
              Alert.alert(
                "Глава пока недоступна",
                err instanceof ApiError ? err.message : "Попробуйте ещё раз",
              );
            }
          }}
        />
      )}

      <DialogueLog
        slotId={slotId}
        visible={logOpen}
        fontScale={settings.fontScale}
        onClose={() => setLogOpen(false)}
      />
      <ReaderSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </View>
  );
}

/** Full-screen image that fades to the next one instead of snapping (background, CG).
 * The previous image stays underneath until the new one has loaded and faded in. */
function CrossfadeImage({ uri, instant }: { uri: string | null; instant: boolean }) {
  const [shown, setShown] = useState<string | null>(uri);
  const [incoming, setIncoming] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(uri ? 1 : 0)).current;
  const incomingOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (uri === shown) return;
    if (!uri) {
      Animated.timing(opacity, {
        toValue: 0,
        duration: instant ? 0 : 400,
        useNativeDriver: true,
      }).start(() => {
        setShown(null);
      });
      return;
    }
    if (!shown || instant) {
      setShown(uri);
      opacity.setValue(1);
      return;
    }
    incomingOpacity.setValue(0);
    setIncoming(uri);
  }, [uri]);

  const onIncomingLoaded = () => {
    Animated.timing(incomingOpacity, { toValue: 1, duration: 450, useNativeDriver: true }).start(
      () => {
        setShown(incoming);
        setIncoming(null);
      },
    );
  };

  return (
    <>
      {shown ? (
        <Animated.Image
          source={{ uri: shown }}
          style={[StyleSheet.absoluteFill, { opacity }]}
          resizeMode="cover"
        />
      ) : null}
      {incoming ? (
        <Animated.Image
          source={{ uri: incoming }}
          onLoad={onIncomingLoaded}
          onError={onIncomingLoaded}
          style={[StyleSheet.absoluteFill, { opacity: incomingOpacity }]}
          resizeMode="cover"
        />
      ) : null}
    </>
  );
}

function resolveBoxPosition(view: DialogueView): "left" | "center" | "right" {
  if (!view.speaker) return "center"; // narrator
  const own = view.staged.find((s) => s.characterId === view.speaker?.id);
  // A speaker who is not on stage gets the centred, full-width panel, same as the narrator.
  return own?.position ?? "center";
}

function DialogueBox({
  view,
  text,
  fullText,
  done,
  autoMs,
}: {
  view: DialogueView;
  text: string;
  fullText: string;
  done: boolean;
  /** While the auto-tap is counting down: how long it will take, for the progress line. */
  autoMs: number | null;
}) {
  const { fontScale, boxOpacity } = useReaderSettings();
  const countdown = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (autoMs === null) return countdown.setValue(0);
    countdown.setValue(1);
    const animation = Animated.timing(countdown, {
      toValue: 0,
      duration: autoMs,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [autoMs, countdown, view.nodeId]);
  const boxPosition = resolveBoxPosition(view);
  const fontSize = 16 * fontScale;
  const lineHeight = 23 * fontScale;
  return (
    <View
      style={[
        styles.dialogueBox,
        { backgroundColor: `rgba(20,16,13,${boxOpacity})` },
        boxPosition === "left" && styles.dialogueBoxLeft,
        boxPosition === "center" && styles.dialogueBoxCenter,
        boxPosition === "right" && styles.dialogueBoxRight,
        view.isThought && styles.thoughtBox,
      ]}
      accessible
      accessibilityLabel={`${view.speaker ? `${t(view.speaker.name)}: ` : ""}${fullText}`}
    >
      {view.speaker ? (
        <Text
          style={[styles.speakerName, { color: view.speaker.nameColor, fontSize: 15 * fontScale }]}
        >
          {t(view.speaker.name)}
        </Text>
      ) : null}
      {/* The invisible full line reserves the final height, so the panel does not grow
          and push the layout around while the visible text is being typed. */}
      <View>
        <Text style={[styles.dialogueText, { fontSize, lineHeight, opacity: 0 }]}>{fullText}</Text>
        <Text
          style={[
            styles.dialogueText,
            styles.typed,
            { fontSize, lineHeight },
            view.isThought && styles.thoughtText,
          ]}
        >
          {text}
        </Text>
      </View>
      <Text style={[styles.advanceHint, !(done && view.canAdvance) && styles.hidden]}>▼</Text>
      {/* Auto-tap countdown: a thin gold line that burns down until the next tap. */}
      <Animated.View
        style={[
          styles.autoLine,
          { opacity: autoMs === null ? 0 : 1, transform: [{ scaleX: countdown }] },
        ]}
      />
    </View>
  );
}

function ChoicePanel({
  view,
  busy,
  paused,
  onChoose,
  onTimeout,
}: {
  view: ChoiceView;
  busy: boolean;
  paused: boolean;
  onChoose: (option: ChoiceOptionView) => void;
  onTimeout: (option: ChoiceOptionView) => void;
}) {
  const { fontScale } = useReaderSettings();
  const remaining = useRef(new Animated.Value(1)).current;
  const timeoutOption = view.timerSeconds
    ? view.options.find((o) => o.id === view.timeoutOptionId)
    : undefined;

  // The countdown restarts from full whenever the reader comes back from the log/settings:
  // it is there for tension, not to punish someone for adjusting the font size.
  useEffect(() => {
    if (!view.timerSeconds || !timeoutOption || paused || busy) return;
    remaining.setValue(1);
    const animation = Animated.timing(remaining, {
      toValue: 0,
      duration: view.timerSeconds * 1000,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    animation.start(({ finished }) => {
      if (finished) onTimeout(timeoutOption);
    });
    return () => animation.stop();
  }, [view.nodeId, paused, busy]);

  return (
    <View style={styles.choicePanel}>
      {view.prompt ? (
        <Text style={[styles.choicePrompt, { fontSize: 16 * fontScale }]}>{t(view.prompt)}</Text>
      ) : null}
      {view.timerSeconds && timeoutOption ? (
        <View style={styles.timerTrack} accessibilityLabel={`На выбор ${view.timerSeconds} секунд`}>
          <Animated.View style={[styles.timerFill, { transform: [{ scaleX: remaining }] }]} />
        </View>
      ) : null}
      {view.options.map((option) => {
        const paid = Boolean(option.costCurrency) && option.costAmount > 0;
        const locked = paid && !option.owned && !option.affordable;
        return (
          <Pressable
            key={option.id}
            onPress={() => onChoose(option)}
            disabled={busy || locked}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || locked }}
            style={({ pressed }) => [
              styles.choiceOption,
              paid && styles.choiceOptionPaid,
              locked && styles.choiceOptionDisabled,
              pressed && styles.choiceOptionPressed,
            ]}
          >
            <Text style={[styles.choiceOptionText, { fontSize: 15 * fontScale }]}>
              {t(option.text)}
            </Text>
            {paid ? (
              <Text style={[styles.choiceOptionCost, option.owned && styles.choiceOwned]}>
                {option.owned
                  ? "открыто"
                  : `${costLabel(option.costCurrency ?? "SOFT", option.costAmount)}${locked ? " · не хватает" : ""}`}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
      {view.options.length === 0 ? (
        <Text style={styles.choicePrompt}>
          Здесь пока нет доступных вариантов. Вернитесь на шаг назад.
        </Text>
      ) : null}
    </View>
  );
}

function EndPanel({
  view,
  busy,
  onReplay,
  onNext,
}: {
  view: EndView;
  busy: boolean;
  onReplay: () => void;
  onNext: (chapterId: string) => void;
}) {
  const appear = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(appear, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [appear]);
  const { rewards, nextChapter } = view;
  const earned = [
    rewards.xp > 0 ? `+${rewards.xp} опыта` : null,
    rewards.soft > 0 ? `+${rewards.soft} зёрен` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.endScrim, { opacity: appear }]}>
      <SafeAreaView style={styles.endPanel}>
        <View style={styles.endRule} />
        <Text style={styles.endEyebrow}>Глава завершена</Text>
        <Text style={styles.endTitle}>
          {view.endingTitle ? t(view.endingTitle) : "Продолжение следует"}
        </Text>
        {earned ? <Text style={styles.endRewards}>{earned}</Text> : null}
        <View style={styles.endRule} />
        <View style={styles.endActions}>
          {nextChapter ? (
            <Button
              title={
                nextChapter.unlocked
                  ? `Следующая глава: ${t(nextChapter.title)}`
                  : `Открыть следующую главу · ${nextChapter.unlockCost} ключей`
              }
              onPress={() => onNext(nextChapter.id)}
              disabled={busy}
            />
          ) : (
            <Text style={styles.endNote}>Новые главы уже пишутся — загляните позже.</Text>
          )}
          <Button
            title="Пройти главу заново"
            onPress={onReplay}
            variant="secondary"
            disabled={busy}
          />
          <Button title="К списку глав" onPress={() => router.back()} variant="secondary" />
        </View>
      </SafeAreaView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: "#0a0812", overflow: "hidden" },
  center: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: 16,
    padding: 24,
  },
  errorText: { color: colors.danger, textAlign: "center", fontSize: 15, lineHeight: 22 },
  world: { ...StyleSheet.absoluteFillObject },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(10,8,18,0.25)" },
  stage: { ...StyleSheet.absoluteFillObject, bottom: 20 },
  dip: { backgroundColor: "#000" },
  flash: { backgroundColor: "#fff8e7" },
  topBar: { position: "absolute", top: 0, left: 0, right: 0, alignItems: "center", paddingTop: 8 },
  // About the height of the character's head (the sprite fills 90% of the stage).
  menu: { position: "absolute", top: "12%", left: 0, right: 0 },
  hint: { position: "absolute", top: "13%", left: 24, right: 24, alignItems: "center" },
  hintText: {
    color: colors.text,
    fontSize: 13,
    textAlign: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(20,16,13,0.8)",
  },
  autoLine: {
    position: "absolute",
    left: 20,
    right: 20,
    bottom: 0,
    height: 2,
    backgroundColor: colors.accent,
  },
  modeBadge: {
    color: colors.accent,
    fontSize: 12,
    letterSpacing: 0.4,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 6,
  },
  // Anchored at the waist line's on-screen position (tuned by eye with the owner), overlaying
  // the character's lower body instead of pushing the sprite up.
  foreground: {
    position: "absolute",
    left: 0,
    right: 0,
    top: "51%",
    bottom: 0,
    justifyContent: "flex-start",
  },
  tapArea: { paddingHorizontal: 16, paddingBottom: 32 },
  dialogueBox: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    minHeight: 120,
    gap: 8,
  },
  dialogueBoxLeft: { width: "94%", alignSelf: "flex-start" },
  dialogueBoxCenter: { width: "100%", alignSelf: "center" },
  dialogueBoxRight: { width: "94%", alignSelf: "flex-end" },
  thoughtBox: { borderColor: colors.accentMuted, borderStyle: "dashed" },
  speakerName: { fontWeight: "700" },
  dialogueText: { color: colors.text },
  typed: { position: "absolute", top: 0, left: 0, right: 0 },
  thoughtText: { fontStyle: "italic", color: colors.textMuted },
  advanceHint: { color: colors.accent, fontSize: 11, alignSelf: "flex-end" },
  hidden: { opacity: 0 },
  choicePanel: { paddingHorizontal: 16, paddingBottom: 24, gap: 12 },
  choicePrompt: {
    color: colors.text,
    fontWeight: "600",
    textAlign: "center",
    marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 8,
  },
  timerTrack: {
    height: 2,
    backgroundColor: "rgba(243,236,224,0.18)",
    borderRadius: 1,
    overflow: "hidden",
  },
  timerFill: { flex: 1, backgroundColor: colors.accent },
  choiceOption: {
    backgroundColor: "rgba(31,26,22,0.94)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 52,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  choiceOptionPaid: { borderColor: colors.accent },
  choiceOptionPressed: { opacity: 0.8 },
  choiceOptionDisabled: { opacity: 0.5 },
  choiceOptionText: { color: colors.text, flex: 1 },
  choiceOptionCost: { color: colors.accent, fontSize: 13, fontWeight: "600" },
  choiceOwned: { color: colors.textMuted, fontWeight: "400" },
  endScrim: { backgroundColor: "rgba(16,13,11,0.9)" },
  endPanel: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    gap: 14,
  },
  endRule: { width: 56, height: StyleSheet.hairlineWidth * 2, backgroundColor: colors.accent },
  endEyebrow: {
    color: colors.accentMuted,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 10,
  },
  endTitle: {
    color: colors.text,
    fontSize: 28,
    lineHeight: 36,
    textAlign: "center",
    fontFamily: fonts.displaySemiBold,
  },
  endRewards: { color: colors.accent, fontSize: 15, marginBottom: 10 },
  endNote: { color: colors.textMuted, textAlign: "center", fontSize: 14, lineHeight: 20 },
  endActions: { alignSelf: "stretch", gap: 12, marginTop: 22 },
});
