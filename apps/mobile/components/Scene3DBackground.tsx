import { useMemo, useRef } from "react";
import { StyleSheet, View } from "react-native";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as THREE from "three";

type Props = {
  /** Story cover image URLs - when given, flying books wear the real cover as a
   * texture instead of a plain color; cycles through the list if there are
   * fewer covers than book slots. */
  coverUrls?: string[];
  bookCount?: number;
  starCount?: number;
  /** Half-width (in the -5..5 star field space) of a center column with no
   * stars - keeps sparkle off a foreground subject's face when the photo
   * behind this layer has one centered, instead of scattering everywhere. */
  avoidCenterX?: number;
  /** Overrides the shared book/star opacity for stars only - use to make the
   * starfield read as a bright, volumetric foreground+background effect
   * rather than a faint backdrop. */
  starOpacity?: number;
};

const STAR_VERTEX = `
  attribute float aPhase;
  attribute float aSize;
  varying float vPhase;
  uniform float uTime;
  void main() {
    vPhase = sin(uTime * 1.6 + aPhase) * 0.5 + 0.5;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (1.0 + vPhase * 0.9) * (60.0 / -mvPosition.z);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const STAR_FRAGMENT = `
  precision mediump float;
  varying float vPhase;
  uniform vec3 uColor;
  uniform float uOpacity;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    float alpha = pow(max(0.0, 1.0 - d), 2.0);
    gl_FragColor = vec4(uColor, alpha * (0.35 + vPhase * 0.65) * uOpacity);
  }
`;

/** Points with a twinkle shader - each star pulses on its own phase, unlike a
 * single opacity value animated on the whole cloud at once. */
function Starfield({
  count,
  opacity,
  avoidCenterX = 0,
}: {
  count: number;
  opacity: number;
  avoidCenterX?: number;
}) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const [positions, phases, sizes] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    const sz = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      let x = (Math.random() - 0.5) * 10;
      if (avoidCenterX > 0) {
        const side = x < 0 ? -1 : 1;
        x = side * (avoidCenterX + Math.random() * (5 - avoidCenterX));
      }
      pos[i * 3] = x;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 10;
      // Wide z spread, some stars nearer the camera than the photo plane and
      // some further back, so the field reads as volume instead of a flat
      // sheet of sparkle sitting on top of the image.
      pos[i * 3 + 2] = (Math.random() - 0.5) * 9 - 1;
      ph[i] = Math.random() * Math.PI * 2;
      // Skewed distribution: mostly small background sparkle, occasional
      // large "foreground" star for a sense of depth.
      sz[i] = 2 + Math.random() ** 2.2 * 9;
    }
    return [pos, ph, sz];
  }, [count, avoidCenterX]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new THREE.Color("#f6dfa0") },
      uOpacity: { value: opacity },
    }),
    [opacity],
  );

  useFrame((state) => {
    if (materialRef.current) {
      materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
    }
  });

  return (
    <points>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aPhase" args={[phases, 1]} />
        <bufferAttribute attach="attributes-aSize" args={[sizes, 1]} />
      </bufferGeometry>
      <shaderMaterial
        ref={materialRef}
        uniforms={uniforms}
        vertexShader={STAR_VERTEX}
        fragmentShader={STAR_FRAGMENT}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

type BookSeed = {
  radius: number;
  height: number;
  speed: number;
  spin: number;
  color: string;
  coverUrl?: string;
};

function CoverFace({ url }: { url: string }) {
  const texture = useLoader(THREE.TextureLoader, url);
  return (
    <mesh position={[0, 0, 0.056]}>
      <planeGeometry args={[0.38, 0.54]} />
      <meshStandardMaterial map={texture} roughness={0.5} />
    </mesh>
  );
}

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
        <meshStandardMaterial color="#d4af6a" roughness={0.3} metalness={0.75} transparent opacity={opacity} />
      </mesh>
      <mesh scale={[0.4, 0.56, 0.11]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={seed.color} roughness={0.7} transparent opacity={opacity} />
      </mesh>
      {seed.coverUrl ? <CoverFace url={seed.coverUrl} /> : null}
    </group>
  );
}

function Scene({
  coverUrls,
  bookCount,
  starCount,
  avoidCenterX,
  starOpacity,
}: Required<Omit<Props, "coverUrls" | "avoidCenterX" | "starOpacity">> &
  Pick<Props, "coverUrls" | "avoidCenterX" | "starOpacity">) {
  const opacity = 0.6;
  const seeds = useMemo<BookSeed[]>(() => {
    const palette = ["#241f1a", "#3a2a20", "#4a3225", "#2f2820"];
    return Array.from({ length: bookCount }, (_, i) => ({
      radius: 1.6 + Math.random() * 1.6,
      height: (Math.random() - 0.5) * 2.2,
      speed: 0.12 + Math.random() * 0.1,
      spin: (Math.random() > 0.5 ? 1 : -1) * (0.3 + Math.random() * 0.3),
      color: palette[i % palette.length],
      coverUrl: coverUrls && coverUrls.length ? coverUrls[i % coverUrls.length] : undefined,
    }));
  }, [bookCount, coverUrls]);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[2, 3, 4]} intensity={0.8} color="#f6dfa0" />
      <Starfield count={starCount} opacity={starOpacity ?? opacity} avoidCenterX={avoidCenterX} />
      {seeds.map((seed, i) => (
        <FlyingBook key={i} seed={seed} opacity={opacity} />
      ))}
    </>
  );
}

/** Fills its parent with an ambient 3D scene of drifting books and a twinkling
 * starfield. Absolutely positioned and non-interactive so it never intercepts
 * touches meant for real UI on top. */
export function Scene3DBackground({
  coverUrls,
  bookCount = 3,
  starCount = 90,
  avoidCenterX,
  starOpacity,
}: Props) {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Canvas camera={{ position: [0, 0, 5], fov: 55 }} gl={{ antialias: false }}>
        <Scene
          coverUrls={coverUrls}
          bookCount={bookCount}
          starCount={starCount}
          avoidCenterX={avoidCenterX}
          starOpacity={starOpacity}
        />
      </Canvas>
    </View>
  );
}
