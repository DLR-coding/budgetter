import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { PixelRatio, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Skia, type SkImage } from 'react-native-skia';
import { importDevice } from 'react-native-webgpu';
import { colors } from '../theme';

// Capture en direct de l'écran derrière le verre : Skia ne voit pas les vues natives,
// on lui donne donc une image de la bande d'écran sous la barre, recapturée à chaque image
// (react-native-webgpu, drawElementImageToTexture ; sur GPU sans copie dès Android 13).

type ViewRef = ComponentRef<typeof View>;
type Scenes = Map<string, RefObject<ViewRef | null>>;
const ScenesContext = createContext<Scenes>(new Map());

export function GlassScenes({ children }: { children: ReactNode }) {
  const scenes = useRef<Scenes>(new Map()).current;
  return <ScenesContext.Provider value={scenes}>{children}</ScenesContext.Provider>;
}

// Enveloppe d'un onglet (screenLayout) : la vue que la barre capture, sans la barre elle-même.
export function GlassScene({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const scenes = useContext(ScenesContext);
  const ref = useRef<ViewRef>(null);
  useEffect(() => {
    scenes.set(routeKey, ref);
    return () => { scenes.delete(routeKey); };
  }, [scenes, routeKey]);
  // Fond opaque : la capture ne doit pas avoir de trous transparents (noir sous le verre).
  return <View ref={ref} collapsable={false} style={{ flex: 1, backgroundColor: colors.bg }}>{children}</View>;
}

export function useGlassScene(routeKey: string) {
  return useContext(ScenesContext).get(routeKey);
}

export type Strip = { x: number; y: number; width: number; height: number };

// Image (partagée avec le thread UI) de la bande `strip` de la scène, en dp de la scène ;
// `ready` passe à vrai à la première capture réussie.
export function useLiveBackdrop(scene: RefObject<ViewRef | null> | undefined, strip: Strip | null) {
  const image = useSharedValue<SkImage | null>(null);
  const texture = useRef<GPUTexture | null>(null);
  const warned = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!scene || !strip || !Skia.gpu.isAvailable) return;
    let alive = true;
    let frame = 0;
    const device = importDevice(Skia.getNativeDevice());
    const pd = PixelRatio.get();
    const size = [Math.round(strip.width * pd), Math.round(strip.height * pd)];

    const tick = async () => {
      if (alive && scene.current && Skia.gpu.foreground) {
        const next = device.createTexture({
          size,
          format: 'rgba8unorm',
          usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        });
        try {
          await device.queue.drawElementImageToTexture(
            { source: scene.current, sourceX: strip.x, sourceY: strip.y, sourceWidth: strip.width, sourceHeight: strip.height },
            { texture: next, premultipliedAlpha: true },
          );
          if (!alive) { next.destroy(); return; }
          // Une nouvelle image fait redessiner le canevas ; l'ancienne est libérée avant sa texture.
          const previous = image.value;
          image.value = Skia.Image.MakeFromGPUTexture(next);
          previous?.dispose();
          texture.current?.destroy();
          texture.current = next;
          setReady(true);
        } catch (e) {
          next.destroy();
          // Vue démontée ou redimensionnée pendant la capture : on réessaie à l'image suivante.
          if (__DEV__ && !warned.current) { warned.current = true; console.warn('Capture du verre impossible', e); }
        }
      }
      if (alive) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => { alive = false; cancelAnimationFrame(frame); };
  }, [scene, strip?.x, strip?.y, strip?.width, strip?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  return { image, ready };
}
