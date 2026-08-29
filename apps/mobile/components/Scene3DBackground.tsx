import { useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type Variant = "hero" | "ambient";

type Props = {
  /** "hero" is denser and brighter for the login/splash moment; "ambient" is sparse and
   * dim so it reads as atmosphere behind real UI content instead of competing with it. */
  variant?: Variant;
};

const VARIANT_CONFIG: Record<Variant, { bookCount: number; starCount: number; opacity: number }> = {
  hero: { bookCount: 6, starCount: 220, opacity: 1 },
  ambient: { bookCount: 3, starCount: 90, opacity: 0.55 },
};

/** A soft round glow sprite built as raw pixel data - avoids pulling in a canvas-drawing
 * dependency just to make a radial gradient for star points. */
function createGlowTexture(): THREE.DataTexture {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - center) / center;
      const dy = (y - center) / center;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const alpha = Math.max(0, 1 - dist) ** 2;
      const i = (y * size + x) * 4;
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.needsUpdate = true;
  return texture;
}

function Starfield({ count, opacity }: { count: number; opacity: number }) {
  const glow = useMemo(() => createGlowTexture(), []);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 10;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 6 - 2;
    }
    return arr;
  }, [count]);
  const pointsRef = useRef<THREE.Points>(null);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.02;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.055}
        map={glow}
        color="#f6dfa0"
        transparent
        opacity={opacity}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        sizeAttenuation
      />
    </points>
  );
}

type BookSeed = {
  radius: number;
  angle: number;
  height: number;
  speed: number;
  spin: number;
  color: string;
};

function FlyingBook({ seed, opacity }: { seed: BookSeed; opacity: number }) {
  const group = useRef<THREE.Group>(null);
  const t0 = useMemo(() => Math.random() * Math.PI * 2, []);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime * seed.speed + t0;
    group.current.position.set(
      Math.cos(t) * seed.radius,
      seed.height + Math.sin(t * 1.3) * 0.35,
      Math.sin(t) * seed.radius - 2,
    );
    group.current.rotation.y = t * seed.spin;
    group.current.rotation.x = Math.sin(t * 0.6) * 0.25;
  });

  return (
    <group ref={group}>
      {/* Thin gold "cover" box slightly larger than the body, faked as an outline. */}
      <mesh scale={[0.46, 0.62, 0.09]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color="#d4af6a" roughness={0.4} metalness={0.6} transparent opacity={opacity} />
      </mesh>
      <mesh scale={[0.4, 0.56, 0.11]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={seed.color} roughness={0.7} transparent opacity={opacity} />
      </mesh>
    </group>
  );
}

function Scene({ variant }: { variant: Variant }) {
  const { bookCount, starCount, opacity } = VARIANT_CONFIG[variant];
  const seeds = useMemo<BookSeed[]>(() => {
    const palette = ["#2a2338", "#3a2a4a", "#4a2f3a", "#241f36"];
    return Array.from({ length: bookCount }, (_, i) => ({
      radius: 1.6 + Math.random() * 1.6,
      angle: (i / bookCount) * Math.PI * 2,
      height: (Math.random() - 0.5) * 2.2,
      speed: 0.12 + Math.random() * 0.1,
      spin: (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.3),
      color: palette[i % palette.length],
    }));
  }, [bookCount]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={0.8} color="#f6dfa0" />
      <Starfield count={starCount} opacity={opacity} />
      {seeds.map((seed, i) => (
        <FlyingBook key={i} seed={seed} opacity={opacity} />
      ))}
    </>
  );
}

/** Fills its parent with an ambient 3D scene of drifting books and a starfield. Absolutely
 * positioned and non-interactive so it never intercepts touches meant for real UI on top. */
export function Scene3DBackground({ variant = "hero" }: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas camera={{ position: [0, 0, 5], fov: 55 }} gl={{ antialias: false }}>
        <Scene variant={variant} />
      </Canvas>
    </View>
  );
}
