import { onUnmounted, ref } from 'vue';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { Network } from '@capacitor/network';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

export function useConexion() {
  const conectado = ref(true);
  const tipo = ref('unknown');

  let handle: PluginListenerHandle | null = null;
  let destruido = false;

  // Valor inicial
  Network.getStatus()
    .then((estado) => {
      conectado.value = estado.connected;
      tipo.value = estado.connectionType;
    })
    .catch(() => {});

  // Se mantiene actualizado mientras la página exista
  Network.addListener('networkStatusChange', (estado) => {
    conectado.value = estado.connected;
    tipo.value = estado.connectionType;
  }).then((h) => {
    // Si la página ya se destruyó antes de que el oyente quedara registrado, se libera de inmediato
    if (destruido) h.remove();
    else handle = h;
  });

  // Liberar el oyente al destruir la página que usa el composable
  onUnmounted(() => {
    destruido = true;
    handle?.remove();
  });

  return { conectado, tipo };
}

export async function vibrar() {
  // En el navegador no hay vibración nativa: no hace nada
  if (!Capacitor.isNativePlatform()) return;
  await Haptics.impact({ style: ImpactStyle.Light });
}