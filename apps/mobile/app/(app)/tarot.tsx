import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Image, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { router, Stack } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { TableBackdrop } from "../../components/TableBackdrop";
import { CARD_ASPECT, CARD_BACK, drawPair, TAROT_DECK, type TarotCard } from "../../lib/tarot";
import { colors, fonts } from "../../lib/theme";
import { useReduceMotion } from "../../lib/use-reduce-motion";

const DECK_CARDS = 7;
const native = true;

/** One card of the deck being shuffled: it slides out to one side, tilts and slips back
 * under the others, each card on its own beat. */
function ShufflingCard({ index, width, active }: { index: number; width: number; active: boolean }) {
  const slide = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      slide.stopAnimation();
      Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: native }).start();
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(index * 190),
        Animated.timing(slide, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: native }),
        Animated.timing(slide, { toValue: 0, duration: 340, easing: Easing.in(Easing.cubic), useNativeDriver: native }),
        Animated.delay((DECK_CARDS - index) * 190),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, index, slide]);

  const side = index % 2 === 0 ? -1 : 1;
  return (
    <Animated.Image
      source={CARD_BACK}
      style={[
        styles.deckCard,
        {
          width,
          height: width * CARD_ASPECT,
          top: -index * 1.5,
          transform: [
            { translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [0, side * width * 0.72] }) },
            { translateY: slide.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -14, -6] }) },
            { rotate: slide.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${side * 9}deg`] }) },
          ],
        },
      ]}
    />
  );
}

/** A card dealt onto the table: it flies in from the deck face down and turns over on tap. */
function DealtCard({
  card,
  width,
  from,
  to,
  tilt,
  delay,
  still,
  onReveal,
}: {
  card: TarotCard;
  width: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
  tilt: number;
  delay: number;
  still: boolean;
  onReveal: () => void;
}) {
  const fly = useRef(new Animated.Value(0)).current;
  const turn = useRef(new Animated.Value(1)).current;
  const [faceUp, setFaceUp] = useState(false);
  const [landed, setLanded] = useState(false);

  useEffect(() => {
    Animated.timing(fly, {
      toValue: 1,
      duration: still ? 0 : 620,
      delay: still ? 0 : delay,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: native,
    }).start(() => setLanded(true));
  }, [delay, fly, still]);

  const flip = () => {
    if (faceUp || !landed) return;
    // Turn over: the card narrows to its edge, changes face, and opens again.
    Animated.timing(turn, { toValue: 0, duration: still ? 0 : 170, easing: Easing.in(Easing.quad), useNativeDriver: native }).start(() => {
      setFaceUp(true);
      onReveal();
      Animated.timing(turn, { toValue: 1, duration: still ? 0 : 220, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
    });
  };

  return (
    <Animated.View
      style={[
        styles.dealt,
        {
          width,
          left: to.x,
          top: to.y,
          opacity: fly.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 1] }),
          transform: [
            { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [from.x - to.x, 0] }) },
            { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [from.y - to.y, 0] }) },
            { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: [`${tilt * 12}deg`, `${faceUp ? 0 : tilt}deg`] }) },
            { scale: fly.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
            { scaleX: turn },
          ],
        },
      ]}
    >
      <Pressable
        onPress={flip}
        accessibilityRole="button"
        accessibilityLabel={faceUp ? card.name : "Карта рубашкой вверх. Нажмите, чтобы открыть"}
      >
        <Image
          source={faceUp ? card.image : CARD_BACK}
          resizeMode="stretch"
          style={[styles.cardImage, { width, height: width * CARD_ASPECT }]}
        />
      </Pressable>
    </Animated.View>
  );
}

export default function TarotScreen() {
  const { width, height } = useWindowDimensions();
  const still = useReduceMotion();
  // A new key remounts the dealt cards for every draw.
  const [draw, setDraw] = useState<{ key: number; cards: [TarotCard, TarotCard] } | null>(null);
  const [revealed, setRevealed] = useState(0);

  const deckWidth = Math.min(118, width * 0.28);
  const cardWidth = Math.min(150, (width - 20 * 2 - 18) / 2);
  const slots = useMemo(() => {
    const top = Math.max(96, height * 0.17);
    const left = (width - cardWidth * 2 - 18) / 2;
    return [
      { x: left, y: top },
      { x: left + cardWidth + 18, y: top },
    ];
  }, [cardWidth, height, width]);
  const deckOrigin = { x: (width - cardWidth) / 2, y: height - deckWidth * CARD_ASPECT - 40 };

  const pull = () => {
    const [first, second] = drawPair(TAROT_DECK.length);
    setRevealed(0);
    setDraw({ key: Date.now(), cards: [TAROT_DECK[first], TAROT_DECK[second]] });
  };

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      <TableBackdrop still={still} />
      <View style={styles.scrim} pointerEvents="none" />

      {draw
        ? draw.cards.map((card, index) => (
            <DealtCard
              key={`${draw.key}-${card.id}`}
              card={card}
              width={cardWidth}
              from={deckOrigin}
              to={slots[index]}
              tilt={index === 0 ? -5 : 4}
              delay={index * 180}
              still={still}
              onReveal={() => setRevealed((count) => count + 1)}
            />
          ))
        : null}

      <SafeAreaView style={styles.chrome} pointerEvents="box-none">
        <Pressable onPress={() => router.back()} hitSlop={16} style={styles.back} accessibilityRole="button" accessibilityLabel="Назад">
          <Text style={styles.backText}>‹ Назад</Text>
        </Pressable>

        <View style={styles.bottom} pointerEvents="box-none">
          {!draw ? (
            <View style={styles.caption} pointerEvents="none">
              <Text style={styles.title}>Заглянем в будущее?</Text>
              <Text style={styles.subtitle}>Вытяни карту</Text>
            </View>
          ) : (
            <View style={styles.caption} pointerEvents="box-none">
              <Text style={styles.subtitle}>
                {revealed === 0 ? "Коснись карты, чтобы открыть" : revealed === 1 ? "Открой вторую карту" : "Карты открыты"}
              </Text>
              {revealed >= 2 ? (
                <Pressable onPress={() => setDraw(null)} style={styles.again} accessibilityRole="button">
                  <Text style={styles.againText}>Перетасовать колоду</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          <Pressable
            onPress={pull}
            disabled={Boolean(draw)}
            accessibilityRole="button"
            accessibilityLabel="Колода. Нажмите, чтобы вытянуть две карты"
            style={[styles.deck, { width: deckWidth, height: deckWidth * CARD_ASPECT }]}
          >
            {Array.from({ length: DECK_CARDS }, (_, index) => (
              <ShufflingCard key={index} index={index} width={deckWidth} active={!draw && !still} />
            ))}
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#120d09" },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(12,8,5,0.25)" },
  chrome: { flex: 1, justifyContent: "space-between" },
  back: { alignSelf: "flex-start", minHeight: 44, justifyContent: "center", paddingHorizontal: 18 },
  backText: { color: colors.text, fontSize: 18, fontFamily: fonts.grimoire, textShadowColor: "rgba(0,0,0,0.9)", textShadowRadius: 8 },
  bottom: { alignItems: "center", paddingBottom: 26, gap: 18 },
  caption: { alignItems: "center", gap: 4, paddingHorizontal: 24 },
  title: {
    color: colors.text,
    fontSize: 30,
    lineHeight: 36,
    letterSpacing: 1,
    fontFamily: fonts.oracle,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 12,
  },
  subtitle: {
    color: colors.accent,
    fontSize: 21,
    fontFamily: fonts.grimoireItalic,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowRadius: 10,
  },
  again: {
    marginTop: 10,
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: 22,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.accent,
    backgroundColor: "rgba(20,14,9,0.6)",
  },
  againText: { color: colors.accent, fontSize: 18, fontFamily: fonts.grimoire, letterSpacing: 0.5 },
  deck: {},
  deckCard: {
    position: "absolute",
    left: 0,
    borderRadius: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(212,175,106,0.6)",
  },
  dealt: { position: "absolute", alignItems: "center" },
  cardImage: { borderRadius: 9, borderWidth: StyleSheet.hairlineWidth, borderColor: "rgba(212,175,106,0.7)" },
});
