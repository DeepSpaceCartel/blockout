// The Wardrobe's moving looks: win celebrations (with the confetti look),
// how the dice roll, and the streak's flames. Nothing moves when the device
// asks for reduced motion.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { DURATION_MS, SAMPLES, confettiGlyphs, winPieces } from './celebration';
import { useLook } from './looks';

const native = true; // (the native driver: transforms and opacity only)

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((on) => live && setReduced(Boolean(on)))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduced(Boolean(on)));
    return () => {
      live = false;
      if (sub && sub.remove) sub.remove();
    };
  }, []);
  return reduced;
}

// A win: the Wardrobe's celebration over the whole screen, once, when it mounts
export function Celebration() {
  const { width, height } = useWindowDimensions();
  const win = useLook('win').id;
  const glyphs = confettiGlyphs(useLook('confetti'));
  const reduced = useReducedMotion();
  const [pieces] = useState(() => winPieces(win, glyphs, width, height));
  const time = useRef(new Animated.Value(0)).current;
  const end = DURATION_MS + Math.max(0, ...pieces.map((p) => p.delay));
  const [done, setDone] = useState(false);
  useEffect(() => {
    const run = Animated.timing(time, { toValue: end, duration: end, easing: Easing.linear, useNativeDriver: native });
    run.start(() => setDone(true));
    return () => run.stop();
  }, []);
  if (reduced || done) return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="celebration">
      {pieces.map((p, i) => {
        const at = p.xs.map((_, s) => p.delay + (s / SAMPLES) * DURATION_MS);
        // (hidden until its delay: a firework bursts later)
        const inputRange = p.delay ? [p.delay - 1, ...at] : at;
        const with0 = (list, first) => (p.delay ? [first, ...list] : list);
        const move = (list) => time.interpolate({ inputRange, outputRange: with0(list, list[0]), extrapolate: 'clamp' });
        const style = {
          position: 'absolute',
          left: 0,
          top: 0,
          opacity: time.interpolate({ inputRange, outputRange: with0(p.opacities, 0), extrapolate: 'clamp' }),
          transform: [{ translateX: move(p.xs) }, { translateY: move(p.ys) }, { rotate: time.interpolate({ inputRange, outputRange: with0(p.spins, p.spins[0]).map((d) => `${d}deg`), extrapolate: 'clamp' }) }],
        };
        return p.glyph ? (
          <Animated.Text key={i} style={[style, { fontSize: p.size, marginLeft: -p.size / 2, marginTop: -p.size / 2 }]}>
            {p.glyph}
          </Animated.Text>
        ) : (
          <Animated.View
            key={i}
            style={[style, p.round ? { width: p.size / 1.2, height: p.size / 1.2, borderRadius: p.size } : { width: p.size, height: p.size / 2 }, { backgroundColor: p.color }]}
          />
        );
      })}
    </View>
  );
}

// A die rolling in the Wardrobe's roll look (wobble, tumble, bounce, sparkle)
export function Rolling({ rolling, children }) {
  const kind = useLook('roll').id;
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!rolling || reduced) return undefined;
    v.setValue(0);
    const ms = kind === 'tumble' ? 300 : kind === 'bounce' ? 250 : kind === 'sparkle' ? 300 : 120;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: ms, easing: Easing.linear, useNativeDriver: native }));
    loop.start();
    return () => {
      loop.stop();
      v.setValue(0);
    };
  }, [rolling, kind, reduced]);
  const spin = (deg) => v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${deg}deg`] });
  const transform =
    kind === 'tumble' ? [{ rotate: spin(360) }] :
    kind === 'bounce' ? [{ translateY: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, -16, 0] }) }] :
    kind === 'sparkle' ? [{ rotate: spin(360) }, { scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.12, 1] }) }] :
    [{ rotate: v.interpolate({ inputRange: [0, 0.25, 0.75, 1], outputRange: ['0deg', '-12deg', '12deg', '0deg'] }) }];
  return (
    <View>
      <Animated.View style={{ transform }}>{children}</Animated.View>
      {rolling && kind === 'sparkle' && !reduced ? (
        <Animated.Text pointerEvents="none" style={[styles.sparkle, { opacity: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0.2, 1, 0.2] }) }]}>
          ✨
        </Animated.Text>
      ) : null}
    </View>
  );
}

// "🔥 5 in a row": with the Flames look, bigger and flickering the longer it gets
export function Streak({ n, color }) {
  const flames = useLook('streak').id === 'flames';
  const reduced = useReducedMotion();
  const level = n >= 20 ? 3 : n >= 10 ? 2 : n >= 5 ? 1 : 0;
  const lit = flames && level > 0;
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!lit || reduced) return undefined;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: native }), { iterations: -1 });
    loop.start();
    return () => loop.stop();
  }, [lit, reduced]);
  if (n < 2) return null;
  const size = 16 * (lit ? [1, 1.1, 1.35, 1.6][level] : 1);
  return (
    <Animated.Text
      testID="streak"
      style={[
        styles.streak,
        { color: lit ? '#e25822' : color, fontSize: size },
        lit ? { transform: [{ scale: v.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 1.08, 1] }) }], textShadowColor: 'rgba(255, 110, 0, 0.6)', textShadowRadius: 4 * level } : null,
      ]}
    >
      🔥 {n} in a row
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  sparkle: { position: 'absolute', top: -10, right: -10, fontSize: 22 },
  streak: { fontWeight: '800', textAlign: 'center' },
});
