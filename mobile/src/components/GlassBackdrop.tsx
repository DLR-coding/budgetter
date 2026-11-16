import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { PixelRatio, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { Skia, type SkImage } from 'react-native-skia';
import { importDevice } from 'react-native-webgpu';
import { colors } from '../theme';

// Capture en direct de l'écran derrière le verre : Skia ne voit pas les vues natives,
// on lui donne donc une image de la bande d'écran sous la barre, recapturée à chaque image
// (react-native-webgpu, drawElementImageToTexture ; sur GPU sans copie dès Android 13).

type ViewRef = ComponentRef<typeof View>;
type SceneRef = RefObject<ViewRef | null>;
type Scenes = {
  scenes: ReadonlyMap<string, SceneRef>;
  register: (key: string, ref: SceneRef) => void;
  unregister: (key: string) => void;
};
const ScenesContext = createContext<Scenes>({ scenes: new Map(), register: () => {}, unregister: () => {} });

// Registre réactif des onglets : une inscription redessine la barre, qui peut alors mesurer et
// capturer (avec une simple Map, la barre ne voyait l'onglet qu'après une interaction).
export function GlassScenes({ children }: { children: ReactNode }) {
  const [scenes, setScenes] = useState<ReadonlyMap<string, SceneRef>>(new Map());
  const register = useCallback((key: string, ref: SceneRef) => setScenes((prev) => new Map(prev).set(key, ref)), []);
  const unregister = useCallback((key: string) => setScenes((prev) => {
    const next = new Map(prev);
    next.delete(key);
    return next;
  }), []);
  const value = useMemo(() => ({ scenes, register, unregister }), [scenes, register, unregister]);
  return <ScenesContext.Provider value={value}>{children}</ScenesContext.Provider>;
}

// Enveloppe d'un onglet (screenLayout) : la vue que la barre capture, sans la barre elle-même.
// Inscrite à chaque mise en page : la barre la reçoit déjà dimensionnée, et remesure si elle change.
export function GlassScene({ routeKey, children }: { routeKey: string; children: ReactNode }) {
  const { register, unregister } = useContext(ScenesContext);
  const ref = useRef<ViewRef>(null);
  useEffect(() => () => unregister(routeKey), [unregister, routeKey]);
  // Fond opaque : la capture ne doit pas avoir de trous transparents (noir sous le verre).
  return (
    <View
      ref={ref}
      collapsable={false}
      onLayout={() => register(routeKey, ref)}
      style={{ flex: 1, backgroundColor: colors.bg }}
    >
      {children}
    </View>
  );
}

// Vue de l'onglet et version du registre (change à chaque inscription, pour remesurer).
export function useGlassScene(routeKey: string) {
  const { scenes } = useContext(ScenesContext);
  return { scene: scenes.get(routeKey), version: scenes };
}

export type Strip = { x: number; y: number; width: number; height: number };

// Image (partagée avec le thread UI) de la bande `strip` de la scène, en dp de la scène ;
// `ready` passe à vrai à la première capture réussie.
// Nombre de textures en rotation : celle qu'on écrit n'est jamais celle que le canevas affiche.
const POOL = 3;
type Pool = { textures: GPUTexture[]; images: SkImage[] };
function release(pool: Pool) {
  pool.images.forEach((img) => img.dispose());
  pool.textures.forEach((t) => t.destroy());
}

export function useLiveBackdrop(scene: RefObject<ViewRef | null> | undefined, strip: Strip | null) {
  const image = useSharedValue<SkImage | null>(null);
  const shown = useRef<Pool | null>(null); // jeu dont une image est affichée
  const warned = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!scene || !strip || !Skia.gpu.isAvailable) return;
    let alive = true;
    let frame = 0;
    let turn = 0;
    const device = importDevice(Skia.getNativeDevice());
    const pd = PixelRatio.get();
    const size = [Math.round(strip.width * pd), Math.round(strip.height * pd)];
    // Textures et images créées une fois et réutilisées : créer puis détruire une texture à
    // chaque image faisait rejeter des rendus encore en cours (bande noire qui clignote).
    const textures = Array.from({ length: POOL }, () => device.createTexture({
      size,
      format: 'rgba8unorm',
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    }));
    const pool: Pool = { textures, images: textures.map((t) => Skia.Image.MakeFromGPUTexture(t)) };

    const tick = async () => {
      if (alive && scene.current && Skia.gpu.foreground) {
        const i = turn++ % POOL;
        try {
          await device.queue.drawElementImageToTexture(
            { source: scene.current, sourceX: strip.x, sourceY: strip.y, sourceWidth: strip.width, sourceHeight: strip.height },
            { texture: pool.textures[i], premultipliedAlpha: true },
          );
          if (!alive) return;
          // Changer d'objet image fait redessiner le canevas avec la nouvelle capture.
          image.value = pool.images[i];
          if (shown.current !== pool) {
            const old = shown.current;
            shown.current = pool;
            // L'ancien jeu (bande d'une taille précédente) n'est plus affiché : libéré un peu plus tard.
            if (old) setTimeout(() => release(old), 500);
          }
          setReady(true);
        } catch (e) {
          // Vue démontée ou redimensionnée pendant la capture : on réessaie à l'image suivante.
          if (__DEV__ && !warned.current) { warned.current = true; console.warn('Capture du verre impossible', e); }
        }
      }
      if (alive) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      // Jamais affiché : libéré une fois la capture en cours finie ; sinon il le sera quand un
      // autre jeu prendra le relais.
      if (shown.current !== pool) setTimeout(() => release(pool), 500);
    };
  }, [scene, strip?.x, strip?.y, strip?.width, strip?.height]); // eslint-disable-line react-hooks/exhaustive-deps

  return { image, ready };
}
