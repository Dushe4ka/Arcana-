import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import { GlassSurface } from "./GlassSurface";
import { MagicDust } from "./MagicDust";
import { colors, radius } from "../lib/theme";
import { t } from "../lib/locale";
import type { SaveSlotListItem, StorySummary } from "../lib/types";

const CARD_ASPECT = 2 / 3;
// Per step away from the active card: how much it tilts in fake-3D (rotateY),
// leans in-plane (rotateZ), drops down, shrinks, and fades - together this
// reads as a fan of books flying in a shallow semicircle around the active
// one, capped at 2 steps so far neighbors don't over-rotate into illegibility.
const MAX_FAN_STEPS = 2;
// A tighter perspective (closer "camera") plus a wider rotation reads as
// genuine spatial depth instead of a flat skew - the previous 700/13 combo
// was too mild to sell the fan as three-dimensional.
const PERSPECTIVE = 450;
const ROTATE_Y_STEP = 22;
const ROTATE_Z_STEP = 5;
const DROP_STEP = 18;
const SCALE_STEP = 0.12;
const OPACITY_STEP = 0.22;
const AUTO_ADVANCE_DELAY = 2800;

function FanCard({
  story,
  index,
  cardWidth,
  itemStride,
  scrollX,
}: {
  story: StorySummary;
  index: number;
  cardWidth: number;
  itemStride: number;
  scrollX: Animated.Value;
}) {
  // Every transform is driven straight off the live scroll position instead
  // of a "which card is active" step function, so the fan re-poses smoothly
  // every frame while dragging/flinging instead of snapping only once
  // scrolling settles.
  //
  // Built descending (MAX..-MAX) on purpose: inputRange = (index - s) *
  // itemStride, and Animated.interpolate requires inputRange to be
  // ascending. Since itemStride > 0, descending s produces ascending
  // scrollX values; pushing s in the "natural" ascending order here made
  // inputRange descending instead and crashed interpolate().
  const stepPositions = [];
  for (let s = MAX_FAN_STEPS; s >= -MAX_FAN_STEPS; s--) stepPositions.push(s);
  const inputRange = stepPositions.map((s) => (index - s) * itemStride);

  const rotateY = scrollX.interpolate({
    inputRange,
    outputRange: stepPositions.map((s) => `${s * ROTATE_Y_STEP}deg`),
    extrapolate: "clamp",
  });
  const rotateZ = scrollX.interpolate({
    inputRange,
    outputRange: stepPositions.map((s) => `${-s * ROTATE_Z_STEP}deg`),
    extrapolate: "clamp",
  });
  const translateY = scrollX.interpolate({
    inputRange,
    outputRange: stepPositions.map((s) => Math.abs(s) * DROP_STEP),
    extrapolate: "clamp",
  });
  const scale = scrollX.interpolate({
    inputRange,
    outputRange: stepPositions.map((s) => 1 - Math.abs(s) * SCALE_STEP),
    extrapolate: "clamp",
  });
  const opacity = scrollX.interpolate({
    inputRange,
    outputRange: stepPositions.map((s) => Math.max(0.4, 1 - Math.abs(s) * OPACITY_STEP)),
    extrapolate: "clamp",
  });

  return (
    <Animated.View
      style={[
        styles.card,
        {
          width: cardWidth,
          height: cardWidth / CARD_ASPECT,
          opacity,
          // perspective must lead, directly followed by the rotation it
          // applies to, for the 3D depth to actually take effect.
          transform: [{ perspective: PERSPECTIVE }, { rotateY }, { rotateZ }, { translateY }, { scale }],
        },
      ]}
    >
      {story.coverImageUrl ? (
        <Image source={{ uri: story.coverImageUrl }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.coverFallback]} />
      )}
    </Animated.View>
  );
}

/** Hero carousel of the whole library (swipeable, not just started reads) -
 * a story already in progress shows its chapter as the subtitle, everything
 * else shows its blurb, matching the reference's book-teaser card. */
export function ContinueSection({
  stories,
  slotByStoryId,
  onOpen,
}: {
  stories: StorySummary[];
  slotByStoryId: Partial<Record<string, SaveSlotListItem>>;
  onOpen: (story: StorySummary) => void;
}) {
  const { width: screenWidth } = useWindowDimensions();
  const cardWidth = Math.min(180, screenWidth * 0.42);
  const cardSpacing = 16;
  const itemStride = cardWidth + cardSpacing;
  const sidePadding = (screenWidth - cardWidth) / 2;
  const storyCount = stories.length;
  // Position in the rendered (cloned) list of the first real story - 1 when
  // there's a leading clone in front of it, 0 otherwise.
  const OFFSET = storyCount > 1 ? 1 : 0;

  const [activeIndex, setActiveIndex] = useState(0);
  const scrollX = useRef(new Animated.Value(OFFSET * itemStride)).current;
  const scrollRef = useRef<ScrollView>(null);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onScroll = Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
    useNativeDriver: true,
  });

  // A clone of the last story before the first, and a clone of the first
  // story after the last, so swiping - or auto-advancing - off either end
  // lands one normal step onto something that already LOOKS like the story
  // on the other side. A silent, no-animation scrollTo then swaps the clone
  // for the real card before anyone notices. Without both clones, wrapping
  // meant either scrolling backwards across the whole row (a visible jump)
  // or hitting a dead stop at the first/last card.
  const displayStories = storyCount > 1 ? [stories[storyCount - 1], ...stories, stories[0]] : stories;

  // Maps a position in the rendered (cloned) list to the real story it
  // visually represents - the two clone slots map to the story on the
  // *other* end, same as if the list were a genuine circle.
  const realIndexFor = (scrollIndex: number) => {
    if (scrollIndex <= 0) return storyCount - 1;
    if (scrollIndex >= storyCount + 1) return 0;
    return Math.max(0, Math.min(storyCount - 1, scrollIndex - OFFSET));
  };

  // Keeps activeIndex (title/subtitle/dots) glued to whichever card is
  // actually nearest on screen at all times, instead of only updating once
  // a scroll gesture "properly" ends. onMomentumScrollEnd alone isn't
  // reliable for this: starting a new swipe before the previous one's
  // momentum finishes cancels that event on iOS, so a run of quick swipes
  // could leave the text pointing at a card from several swipes ago even
  // though the carousel had already visually moved on.
  useEffect(() => {
    const id = scrollX.addListener(({ value }) => {
      const real = realIndexFor(Math.round(value / itemStride));
      setActiveIndex((prev) => (prev === real ? prev : real));
    });
    return () => scrollX.removeListener(id);
  }, [scrollX, itemStride, storyCount, OFFSET]);

  // Keeps the actual scroll position parked on a real card (never on a
  // clone) once it settles, so the next swipe in either direction always
  // starts from a normal spot.
  const settleAt = (scrollIndex: number) => {
    if (scrollIndex <= 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: storyCount * itemStride, animated: false });
      });
    } else if (scrollIndex >= storyCount + 1) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: OFFSET * itemStride, animated: false });
      });
    }
  };

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    settleAt(Math.round(e.nativeEvent.contentOffset.x / itemStride));
  };

  // Auto-advances the carousel while it's left alone; any touch (drag start)
  // cancels the pending advance, and settling back down (whether from a
  // manual swipe or the auto-advance itself) restarts the idle countdown.
  const scheduleAutoAdvance = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    if (storyCount <= 1) return;
    autoTimer.current = setTimeout(() => {
      // Just scroll - the scrollX listener above picks up activeIndex as
      // the animation actually moves, so it never flips ahead of what's
      // visually on screen.
      setActiveIndex((prev) => {
        scrollRef.current?.scrollTo({ x: (prev + 1 + OFFSET) * itemStride, animated: true });
        return prev;
      });
    }, AUTO_ADVANCE_DELAY);
  }, [OFFSET, itemStride, storyCount]);

  useEffect(() => {
    scheduleAutoAdvance();
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [scheduleAutoAdvance]);

  // Park on the real first card (past the leading clone) on mount - belt and
  // suspenders alongside the ScrollView's own `contentOffset` prop below,
  // since a prop-set initial offset doesn't reliably fire a scroll event
  // (and scrollX, driven by onScroll, needs one to pick up the right value).
  useEffect(() => {
    if (OFFSET > 0) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({ x: OFFSET * itemStride, animated: false });
      });
    }
  }, []);

  const onTouchStart = () => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
  };

  const onSettle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    onScrollEnd(e);
    scheduleAutoAdvance();
  };

  if (stories.length === 0) return null;
  const active = stories[activeIndex];
  const activeSlot = slotByStoryId[active.id];

  return (
    <View style={styles.section}>
      <View style={styles.headingRow}>
        <View style={styles.headingLine} />
        <Text style={styles.heading}>Продолжи свою историю</Text>
        <View style={styles.headingLine} />
      </View>

      <View style={styles.carouselWrap}>
        <MagicDust />

        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          // Off (not the platform default on Android): without it, a card
          // that was off-screen right before an instant jump (landing on 6
          // by snapping back off the leading clone) can stay detached from
          // the native view tree for a beat, popping in late instead of
          // being there immediately.
          removeClippedSubviews={false}
          snapToInterval={itemStride}
          decelerationRate="fast"
          contentContainerStyle={{
            paddingHorizontal: sidePadding,
            paddingBottom: MAX_FAN_STEPS * DROP_STEP,
            gap: cardSpacing,
          }}
          contentOffset={{ x: OFFSET * itemStride, y: 0 }}
          onScroll={onScroll}
          scrollEventThrottle={16}
          onTouchStart={onTouchStart}
          onMomentumScrollEnd={onSettle}
        >
          {displayStories.map((story, index) => {
            const cloneKey = index === 0 ? "start" : index === storyCount + 1 ? "end" : null;
            return (
              <FanCard
                key={cloneKey ? `${story.id}-loop-clone-${cloneKey}` : story.id}
                story={story}
                index={index}
                cardWidth={cardWidth}
                itemStride={itemStride}
                scrollX={scrollX}
              />
            );
          })}
        </Animated.ScrollView>
      </View>

      {stories.length > 1 ? (
        <View style={styles.dots}>
          {stories.map((story, index) => (
            <View key={story.id} style={[styles.dot, index === activeIndex && styles.dotActive]} />
          ))}
        </View>
      ) : null}

      <GlassSurface style={styles.info} intensity={35}>
        <View style={styles.infoText}>
          <Text style={styles.title} numberOfLines={1}>
            {t(active.title)}
          </Text>
          <Text style={styles.subtitle} numberOfLines={2}>
            {activeSlot?.chapter ? t(activeSlot.chapter.title) : t(active.description) || "Начать чтение"}
          </Text>
        </View>
        <Pressable onPress={() => onOpen(active)} style={({ pressed }) => [pressed && styles.readButtonPressed]}>
          <GlassSurface style={styles.readButton} intensity={60} tintColor="rgba(194,147,143,0.78)">
            <Text style={styles.readButtonText}>Читать</Text>
          </GlassSurface>
        </Pressable>
        <Pressable
          hitSlop={12}
          style={({ pressed }) => [styles.bookmark, pressed && styles.bookmarkPressed]}
          onPress={() => Alert.alert("Закладки", "Список закладок пока не готов. Загляните позже.")}
        >
          <Ionicons name="bookmark-outline" size={18} color={colors.textMuted} />
        </Pressable>
      </GlassSurface>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 20,
  },
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    paddingHorizontal: 32,
  },
  headingLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.accentMuted,
    opacity: 0.5,
  },
  heading: {
    color: colors.text,
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  carouselWrap: {
    justifyContent: "center",
  },
  card: {
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.border,
  },
  cover: {
    width: "100%",
    height: "100%",
  },
  coverFallback: {
    backgroundColor: colors.surfaceRaised,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.border,
  },
  dotActive: {
    width: 16,
    backgroundColor: colors.accent,
  },
  info: {
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: radius.lg,
    padding: 20,
  },
  infoText: {
    flex: 1,
    gap: 5,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: "700" },
  subtitle: { color: colors.textMuted, fontSize: 13 },
  readButton: {
    borderRadius: radius.lg,
    paddingHorizontal: 22,
    paddingVertical: 12,
  },
  readButtonPressed: {
    opacity: 0.85,
  },
  readButtonText: {
    color: colors.background,
    fontSize: 14,
    fontWeight: "700",
  },
  bookmark: {
    padding: 2,
  },
  bookmarkPressed: {
    opacity: 0.6,
  },
});
