# Guía de estilo de Carbono

La línea de diseño que siguen `carbono.css` y `carbono.js`. Para instalar el tema, ver el [README](../README.md).

## Principios

- **Superficies neutras, detalles de color.** Fondos, tarjetas, texto y el botón principal son grises o negros. El color entra en elementos pequeños (íconos, chips, globos, mosaicos) y en fondos tenues.
- **La acción principal es neutra.** Guardar, Enviar, Crear, Ejecutar y el botón de voz usan `primary`: negro en tema claro, casi blanco en oscuro.
- **Jerarquía clara.** Cada pantalla distingue título, subtítulo, nombre de ajuste y descripción por tamaño, peso y color, nunca solo por color.
- **Legible en el teléfono.** Debajo de 768 px el texto y los controles crecen un paso y los botones táctiles miden al menos 40–44 px.
- **Vidrio esmerilado en lo que flota.** Barra de título, menús, selector de modelo y la hoja **Herramientas y opciones** usan blanco al 60 % (negro en tema oscuro) con desenfoque de 20 px.
- **El texto antes que el fondo.** El fondo de cada modelo se ve detrás de un velo blanco degradado y desenfocado, casi sólido donde está el texto.
- **Respeta lo personal.** No cambia las imágenes de los avatares ni la animación del modo voz.

## Colores

| Token | Claro | Oscuro | Uso |
| --- | --- | --- | --- |
| `bg` | `#fafafa` | `#131313` | Fondo de la página y del chat |
| `surface` | `#ffffff` | `#1b1b1b` | Composer, modales, tarjetas |
| `sidebar` | `#f4f4f5` | `#171717` | Barra lateral, navegación de Ajustes, globo de tus mensajes |
| `hover` | `#ebebec` | `#262626` | Hover de filas y botones, control segmentado |
| `selected` | `#e4e4e7` | `#2a2a2a` | Chat o pestaña activa |
| `border` / `border-strong` | `#e4e4e7` / `#8b8b93` | `#2a2a2a` / `#6a6a72` | Divisores / bordes de campos |
| `ink` | `#18181b` | `#ececee` | Texto principal |
| `ink-muted` | `#52525b` | `#a6a6ad` | Descripciones, íconos en reposo |
| `ink-subtle` | `#6b6b73` | `#8b8b93` | Etiquetas de sección, fechas |
| `primary` / `on-primary` | `#18181b` / `#ffffff` | `#ececee` / `#18181b` | Acción principal y su texto |

Colores de detalle, cada uno con su versión `-soft` para fondos tenues:

| Color | Claro | Dónde |
| --- | --- | --- |
| `naranja` | `#a84f0c` | Herramientas |
| `verde` | `#2b7a3b` | Búsqueda web |
| `violeta` | `#6f42c8` | Open Terminal, instrucciones del sistema |
| `amarillo` | `#8f5a00` | Razonamiento |
| `azul` | `#2361c7` | Anillo de foco, enlaces, rol Administrador, botón de opciones del teléfono |
| `rosa` | `#b4325c` | Detalles de marca |

Estados: `success` `#14706a`, `danger` `#c0392b`.

## Tipografía

[Atkinson Hyperlegible Next](https://fonts.google.com/specimen/Atkinson+Hyperlegible+Next) para toda la interfaz y Atkinson Hyperlegible Mono para código (Google Fonts). El tema solo cambia la familia; los tamaños siguen la jerarquía de cada pantalla:

- **Chat:** respuestas a 16 px en escritorio y 17 px en el teléfono; el nombre del modelo un paso arriba (17–18 px, seminegrita).
- **Barra lateral y menús:** filas a 15 px en escritorio y 18 px en el teléfono; etiquetas de sección (MODELOS, CHATS, HOY) en mayúsculas pequeñas.
- **Ajustes:** título 24 px › sección 18 px › nombre de ajuste 16 px › descripción 15 px en gris.

## Componentes

- **Chips del composer:** píldoras con borde de 1 px del mismo color que el texto. En escritorio llevan nombre (Herramientas, Web, Open Terminal, Razonamiento); en el teléfono van dentro de la hoja **Herramientas y opciones**, una fila por opción con mosaico de color, descripción e interruptor encendido o apagado. Si la caja de escritorio es angosta, los chips quedan solo con ícono.
- **Contador del botón de opciones:** óvalo pequeño con degradado de `selected` a `azul`, con el total y las activas («4 · 3»).
- **Control segmentado:** pestañas de Administración y Zona de Pruebas sobre un fondo `hover`, con la activa en `surface` y seminegrita.
- **Tarjetas:** `surface`, borde `border`, esquinas de 16 px y sombra mínima.
- **Notificaciones:** colores de estado del sistema, esquinas de 16 px y botón de cerrar dentro de la tarjeta.
