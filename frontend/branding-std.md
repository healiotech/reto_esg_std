# Branding Santander — para el frontend del reto

Valores tomados de la **guía de marca oficial de Santander** (santander.com) y de
la aplicación real vista en el deck del reto (cremas, corales, headlines negros).

> Nota de uso: esto es para un reto interno Santander × Tec (contexto "imagina que
> te incorporas al equipo"). Los colores y la tipografía son marca registrada de
> Banco Santander; úsalos para el demo del reto, no para un producto público
> distribuido. Para el logo, usa el oficial solo dentro del contexto del reto.

## 1. Paleta oficial (primarios)

| Rol | Nombre | HEX | Uso |
|-----|--------|-----|-----|
| **Rojo Santander** | Santander Red | `#EC0000` | Color de marca. Acentos, encabezados, botones primarios, logo. No abusar como fondo de pantallas completas de trabajo. |
| **Blanco** | White | `#FFFFFF` | Fondo principal, claridad, espacio. |
| **Negro** | Black | `#000000` | Texto, headlines condensados. |
| **Sky** | Sky | `#DEEDF2` | Azul muy claro; frescura/tecnología, fondos suaves de tarjetas. |

Recomendación de balance de la propia guía: aproximadamente **50% blanco, 40%
rojo/negro estructural, 5% sky, 5% acentos**. Es decir: mucho blanco, el rojo
como acento potente y no como baño general.

## 2. Paleta de apoyo (del deck del reto — cremas y coral)

Estos tonos aparecen en el material real del reto y suavizan la interfaz para que
no sea todo rojo intenso. Ideales para fondos de tarjetas y secciones.

| Nombre | HEX (aprox.) | Uso |
|--------|--------------|-----|
| Crema / hueso | `#FDF0EC` | Fondo cálido de secciones y tarjetas. |
| Coral suave | `#F4B5A3` | Fondo de bloques secundarios, badges suaves. |
| Coral medio | `#EC8B76` | Acentos cálidos, estados intermedios. |
| Gris texto | `#333333` | Texto secundario. |
| Gris borde | `#E5E5E5` | Bordes, separadores. |

## 3. Colores funcionales (bandas de riesgo)

La herramienta usa 4 bandas. Ármonízalas con la marca: el Crítico ES el rojo
Santander (coherente y potente), y el resto en una escala semáforo sobria.

| Banda | HEX | Nota |
|-------|-----|------|
| **Bajo** | `#2E7D32` | Verde sobrio (no neón). |
| **Medio** | `#F9A825` | Ámbar. |
| **Alto** | `#EF6C00` | Naranja. |
| **Crítico** | `#EC0000` | Rojo Santander — el color de marca hace de máxima alerta. |

Úsalos como fondo de pill/badge con texto blanco (o texto oscuro sobre ámbar).

## 4. Tipografía

La marca usa una fuente propia (**Santander Text / Santander Headline**, de
Monotype) que no es de libre distribución. Para el frontend del reto, usa
sustitutos web que capturan el espíritu (headline condensado y pesado + cuerpo
sans limpio):

- **Headlines** (títulos, números de score): una sans **condensada y pesada**.
  Sustituto web gratuito: **"Archivo" / "Archivo Black"** o **"Oswald"** (Google
  Fonts). El deck del reto usa headlines negros muy bold y algo condensados.
- **Cuerpo / UI**: una sans neutra y legible. Sustituto: **"Inter"** o
  **"Work Sans"** (Google Fonts).

En `index.html`:
```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600;800&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

## 5. Tokens listos para Tailwind

Pega esto en `tailwind.config.js` → `theme.extend`:

```js
export default {
  theme: {
    extend: {
      colors: {
        santander: {
          red: '#EC0000',
          black: '#000000',
          white: '#FFFFFF',
          sky: '#DEEDF2',
          cream: '#FDF0EC',
          coral: '#F4B5A3',
          coralMid: '#EC8B76',
          grayText: '#333333',
          grayBorder: '#E5E5E5',
        },
        banda: {
          bajo: '#2E7D32',
          medio: '#F9A825',
          alto: '#EF6C00',
          critico: '#EC0000',
        },
      },
      fontFamily: {
        head: ['Archivo', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
};
```

Y como variables CSS (por si algún componente no usa Tailwind), en tu `index.css`:

```css
:root {
  --santander-red: #EC0000;
  --santander-sky: #DEEDF2;
  --santander-cream: #FDF0EC;
  --banda-bajo: #2E7D32;
  --banda-medio: #F9A825;
  --banda-alto: #EF6C00;
  --banda-critico: #EC0000;
}
```

## 6. Guía rápida de aplicación en las 3 pantallas

- **Barra superior / header**: fondo blanco, logo Santander a la izquierda, franja
  o borde inferior en rojo `#EC0000`. Sobrio, institucional.
- **Botones primarios** ("Calcular riesgo", "Nueva evaluación"): fondo rojo
  Santander, texto blanco, esquinas suavemente redondeadas (~6px). Como el botón
  "Es el momento" del deck.
- **Tarjetas** (cliente, secciones del cuestionario): fondo blanco o crema
  `#FDF0EC`, borde sutil gris, sombra ligera.
- **Pantalla de resultados**: las dos ScoreCards (crédito / reputación) con el
  color de su banda como acento (barra superior de la tarjeta o el badge), no
  bañando toda la tarjeta — mantén fondo claro y el color como señal.
- **Caja de cristal**: tabla limpia sobre blanco, encabezados en negro, filas
  incumplidas resaltadas con un fondo crema/coral muy tenue.
- **Regla de oro Santander**: mucho blanco, rojo como acento decidido, headlines
  negros condensados. No saturar de rojo; el impacto viene del contraste.

## 7. Línea para el prompt de Claude Code

Añade al prompt del frontend:

> Aplica identidad visual Santander: color de marca rojo `#EC0000`, mucho fondo
> blanco con acentos rojos (no fondos rojos completos), tonos crema `#FDF0EC` y
> coral `#F4B5A3` para tarjetas, headlines en fuente condensada pesada (Archivo/
> Oswald) y cuerpo en Inter. Bandas de riesgo: Bajo verde `#2E7D32`, Medio ámbar
> `#F9A825`, Alto naranja `#EF6C00`, Crítico rojo Santander `#EC0000`. Estética
> institucional, sobria y profesional, tipo banca corporativa.