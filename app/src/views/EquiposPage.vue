<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Equipos</ion-title>
        <ion-buttons slot="end">
          <ion-button router-link="/tabs/equipos/nuevo" aria-label="Nuevo equipo">
            <ion-icon slot="icon-only" :icon="add" />
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar v-model="q" :debounce="400" placeholder="Buscar por código o nombre" @ion-input="buscar" />
      </ion-toolbar>
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: los datos pueden estar desactualizados</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <ion-refresher slot="fixed" @ion-refresh="refrescar">
        <ion-refresher-content />
      </ion-refresher>

      <!-- Primera carga: esqueleto, no spinner a pantalla completa -->
      <ion-list v-if="primeraCarga">
        <ion-item v-for="n in 6" :key="n">
          <ion-label>
            <h2><ion-skeleton-text animated style="width: 60%" /></h2>
            <p><ion-skeleton-text animated style="width: 40%" /></p>
          </ion-label>
          <ion-skeleton-text slot="end" animated style="width: 70px; height: 22px" />
        </ion-item>
      </ion-list>

      <!-- Error con reintentar -->
      <div v-else-if="error" class="estado-vacio">
        <ion-icon :icon="cloudOfflineOutline" />
        <p>{{ error }}</p>
        <ion-button @click="cargar(true)">Reintentar</ion-button>
      </div>

      <!-- Estado vacío -->
      <div v-else-if="equipos.length === 0" class="estado-vacio">
        <ion-icon :icon="searchOutline" />
        <p>No hay equipos que mostrar.</p>
      </div>

      <!-- Listado -->
      <ion-list v-else>
        <ion-item-sliding v-for="equipo in equipos" :key="equipo.id">
          <ion-item :router-link="`/tabs/equipos/${equipo.id}/editar`" detail>
            <ion-label>
              <h2>{{ equipo.nombre }}</h2>
              <p>{{ equipo.codigo }} · {{ equipo.categoria.nombre }}</p>
            </ion-label>
            <ion-badge slot="end" :color="colorEstado[equipo.estado]">{{ equipo.estado }}</ion-badge>
          </ion-item>

          <ion-item-options side="end">
            <ion-item-option color="danger" @click="confirmarEliminacion(equipo, $event)">
              <ion-icon slot="start" :icon="trashOutline" />
              Eliminar
            </ion-item-option>
          </ion-item-options>
        </ion-item-sliding>
      </ion-list>

      <ion-infinite-scroll :disabled="!hayMas" @ion-infinite="cargarMas">
        <ion-infinite-scroll-content />
      </ion-infinite-scroll>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon, IonSearchbar, IonContent,
  IonRefresher, IonRefresherContent, IonList, IonItem, IonLabel, IonSkeletonText, IonBadge,
  IonItemSliding, IonItemOptions, IonItemOption, IonInfiniteScroll, IonInfiniteScrollContent,
  alertController, onIonViewWillEnter,
} from '@ionic/vue';
import type { InfiniteScrollCustomEvent, RefresherCustomEvent } from '@ionic/vue';
import { add, cloudOfflineOutline, searchOutline, trashOutline } from 'ionicons/icons';
import { eliminar, listar, type Equipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

const colorEstado: Record<Estado, string> = { disponible: 'success', prestado: 'warning', mantenimiento: 'medium' };

const { conectado } = useConexion();

const equipos = ref<Equipo[]>([]);
const pagina = ref(0);
const ultimaPagina = ref(1);
const q = ref('');
const cargando = ref(false);
const error = ref('');
const hayMas = computed(() => pagina.value < ultimaPagina.value);
const primeraCarga = computed(() => cargando.value && equipos.value.length === 0 && !error.value);

// Evita que una respuesta lenta pise a una más reciente (p. ej. al escribir rápido en la búsqueda)
let ultimaPeticion = 0;

async function cargar(reiniciar = false) {
  const numero = ++ultimaPeticion;
  const siguiente = reiniciar ? 1 : pagina.value + 1;
  cargando.value = true;
  error.value = '';
  try {
    const respuesta = await listar(siguiente, q.value);
    if (numero !== ultimaPeticion) return;
    equipos.value = reiniciar ? respuesta.data : [...equipos.value, ...respuesta.data];
    pagina.value = respuesta.meta.current_page;
    ultimaPagina.value = respuesta.meta.last_page;
  } catch (e) {
    if (numero !== ultimaPeticion) return;
    error.value =
      e instanceof ErrorApi && e.status === 0
        ? 'No fue posible conectar con la API.'
        : e instanceof Error ? e.message : 'Error al cargar los equipos.';
  } finally {
    if (numero === ultimaPeticion) cargando.value = false;
  }
}

// Se ejecuta CADA vez que se entra a la página (también al volver del formulario);
// onMounted solo corre una vez porque Ionic mantiene la página en la pila.
onIonViewWillEnter(() => cargar(true));

const buscar = (e: CustomEvent) => {
  q.value = e.detail.value ?? '';
  cargar(true);
};

async function refrescar(evento: RefresherCustomEvent) {
  await cargar(true);
  evento.target.complete();
}

async function cargarMas(evento: InfiniteScrollCustomEvent) {
  if (hayMas.value && !cargando.value) await cargar(false);
  evento.target.complete();
}

const quitarDeLista = (id: number) => {
  equipos.value = equipos.value.filter((e) => e.id !== id);
};

async function confirmarEliminacion(equipo: Equipo, evento: Event) {
  // 1. Cerrar el ion-item-sliding que contiene el botón
  const deslizable = (evento.target as HTMLElement).closest('ion-item-sliding') as { close(): Promise<void> } | null;
  await deslizable?.close();

  // 2. Confirmación; el role decide si se continúa
  const alerta = await alertController.create({
    header: 'Eliminar equipo',
    message: `¿Eliminar ${equipo.codigo} · ${equipo.nombre}?`,
    buttons: [
      { text: 'Cancelar', role: 'cancel' },
      { text: 'Eliminar', role: 'destructive' },
    ],
  });
  await alerta.present();
  const { role } = await alerta.onDidDismiss();
  if (role !== 'destructive') return;

  // 3. Llamar a la API y reaccionar según la respuesta
  try {
    await eliminar(equipo.id); // 204
    quitarDeLista(equipo.id);
    await vibrar();
    await mostrarToast('Equipo eliminado.', 'success');
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 409) {
      // Regla R1: el mensaje viene de la API; el equipo permanece en la lista
      await mostrarToast(e.cuerpo?.mensaje ?? e.message, 'warning');
    } else if (e instanceof ErrorApi && e.status === 404) {
      quitarDeLista(equipo.id);
      await mostrarToast('El equipo ya no existe.', 'medium');
    } else {
      await mostrarToast('No se pudo eliminar el equipo.', 'danger');
    }
  }
}
</script>