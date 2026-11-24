<template>
  <ion-page>
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button default-href="/tabs/equipos" text="" />
        </ion-buttons>
        <ion-title>{{ id ? 'Editar equipo' : 'Nuevo equipo' }}</ion-title>
      </ion-toolbar>
      <ion-toolbar v-if="!conectado" color="warning">
        <ion-title size="small">Sin conexión: no es posible guardar</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <form @submit.prevent="guardar" novalidate>
        <ion-list lines="full">
          <ion-item>
            <ion-input v-model="datos.codigo" label="Código" label-placement="stacked" placeholder="EQ-0000"
              autocapitalize="characters" :maxlength="20" />
          </ion-item>
          <small v-if="errores.codigo" class="error-campo">{{ errores.codigo }}</small>

          <ion-item>
            <ion-input v-model="datos.nombre" label="Nombre" label-placement="stacked" :maxlength="120" />
          </ion-item>
          <small v-if="errores.nombre" class="error-campo">{{ errores.nombre }}</small>

          <ion-item>
            <ion-select v-model="datos.categoria_id" label="Categoría" label-placement="stacked"
              interface="action-sheet" placeholder="Seleccione" cancel-text="Cancelar">
              <ion-select-option v-for="c in listaCategorias" :key="c.id" :value="c.id">{{ c.nombre }}</ion-select-option>
            </ion-select>
          </ion-item>
          <small v-if="errores.categoria_id" class="error-campo">{{ errores.categoria_id }}</small>

          <ion-item v-if="estadoActual !== 'prestado'">
            <ion-select v-model="datos.estado" label="Estado" label-placement="stacked" interface="popover">
              <ion-select-option value="disponible">Disponible</ion-select-option>
              <ion-select-option value="mantenimiento">Mantenimiento</ion-select-option>
            </ion-select>
          </ion-item>
          <ion-item v-else>
            <ion-label>Estado: prestado (no se modifica desde aquí)</ion-label>
          </ion-item>
          <small v-if="errores.estado" class="error-campo">{{ errores.estado }}</small>

          <ion-item>
            <ion-input v-model="datos.fecha_adquisicion" label="Fecha de adquisición" label-placement="stacked"
              type="date" :max="hoy" />
          </ion-item>
          <small v-if="errores.fecha_adquisicion" class="error-campo">{{ errores.fecha_adquisicion }}</small>

          <ion-item>
            <ion-input v-model="datos.costo_interno" label="Costo interno (₡)" label-placement="stacked"
              type="number" inputmode="decimal" :min="0"
              :helper-text="id ? 'La API no expone este dato: vuelva a ingresarlo.' : undefined" />
          </ion-item>
          <small v-if="errores.costo_interno" class="error-campo">{{ errores.costo_interno }}</small>
        </ion-list>

        <ion-button type="submit" expand="block" class="ion-margin-top" :disabled="!conectado">
          Guardar
        </ion-button>
      </form>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue';
import {
  IonPage, IonHeader, IonToolbar, IonButtons, IonBackButton, IonTitle, IonContent, IonList, IonItem,
  IonInput, IonSelect, IonSelectOption, IonLabel, IonButton,
  loadingController, onIonViewWillEnter, useIonRouter,
} from '@ionic/vue';
import { actualizar, categorias, crear, obtener, type Categoria, type DatosEquipo, type Estado } from '@/services/equipos';
import { ErrorApi } from '@/services/errores';
import { mostrarToast } from '@/services/avisos';
import { useConexion, vibrar } from '@/composables/useConexion';

// id llega por props: true en la ruta equipos/:id/editar; en equipos/nuevo es undefined
const props = defineProps<{ id?: string }>();
const id = props.id;

const ionRouter = useIonRouter();
const { conectado } = useConexion();
const hoy = new Date().toISOString().slice(0, 10);

const vacio = (): DatosEquipo => ({
  codigo: '', nombre: '', categoria_id: null, estado: 'disponible', fecha_adquisicion: hoy, costo_interno: null,
});

const datos = reactive<DatosEquipo>(vacio());
const listaCategorias = ref<Categoria[]>([]);
const estadoActual = ref<Estado>('disponible');
const errores = ref<Record<string, string>>({});

// [M5] Carga al entrar a la página: categorías y, en edición, el equipo
onIonViewWillEnter(async () => {
  errores.value = {};
  try {
    // Categorías y, si es edición, el equipo, en paralelo
    const [cats, equipo] = await Promise.all([categorias(), id ? obtener(id) : Promise.resolve(null)]);
    listaCategorias.value = cats;

    if (equipo) {
      estadoActual.value = equipo.estado;
      Object.assign(datos, {
        codigo: equipo.codigo,
        nombre: equipo.nombre,
        categoria_id: equipo.categoria.id,
        // Si está prestado el campo estado no se envía ni se muestra
        estado: equipo.estado === 'prestado' ? undefined : equipo.estado,
        fecha_adquisicion: equipo.fecha_adquisicion.slice(0, 10),
        costo_interno: null, // la API no lo devuelve: la persona lo vuelve a ingresar
      });
    } else {
      estadoActual.value = 'disponible';
      Object.assign(datos, vacio());
    }
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 404) {
      await mostrarToast('El equipo ya no existe.', 'warning');
      ionRouter.navigate('/tabs/equipos', 'back', 'replace');
    } else {
      await mostrarToast('No se pudo cargar el formulario.', 'danger');
    }
  }
});

// [M5] Guardar (crear o actualizar)
async function guardar() {
  errores.value = {};

  // 1. Loading que SIEMPRE se cierra (finally)
  const cargador = await loadingController.create({ message: 'Guardando…' });
  await cargador.present();

  let exito = false;
  try {
    // 2. Cuerpo: código en mayúscula y sin espacios, costo como número
    const costo = datos.costo_interno as unknown as string | number | null;
    const cuerpo: DatosEquipo = {
      codigo: datos.codigo.trim().toUpperCase(),
      nombre: datos.nombre.trim(),
      categoria_id: datos.categoria_id,
      fecha_adquisicion: datos.fecha_adquisicion,
      costo_interno: String(costo ?? '').trim() === '' ? null : Number(costo),
    };
    // Si el equipo está prestado, no se envía el campo estado
    if (estadoActual.value !== 'prestado') cuerpo.estado = datos.estado;

    // 3. Nuevo → crear; edición → actualizar
    if (id) await actualizar(id, cuerpo);
    else await crear(cuerpo);
    exito = true;
  } catch (e) {
    if (e instanceof ErrorApi && e.status === 422) {
      // 5. Primer mensaje de cada campo, debajo de su campo
      errores.value = e.erroresPorCampo;
      await mostrarToast('Revise los campos marcados.', 'warning');
    } else if (e instanceof ErrorApi && e.status === 404) {
      await mostrarToast('El equipo ya no existe.', 'warning');
    } else {
      await mostrarToast('No se pudo guardar el equipo.', 'danger');
    }
  } finally {
    await cargador.dismiss();
  }

  // 4. Éxito: vibrar, toast y volver a la lista
  if (exito) {
    await vibrar();
    await mostrarToast(id ? 'Equipo actualizado.' : 'Equipo creado.', 'success');
    if (ionRouter.canGoBack()) ionRouter.back();
    else ionRouter.navigate('/tabs/equipos', 'back', 'replace');
  }
}
</script>