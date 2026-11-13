# Carbono para Open WebUI

**Versión 0.95.2** · probado con Open WebUI **0.13.3**

Carbono es el tema recomendado para [Sakura OI Web](https://github.com/YukiChristian/Sakura-OI-Web). Deja la interfaz de Open WebUI neutra (superficies en tonos carbón y zinc, acción principal en negro), con más jerarquía en el texto, tipografía Atkinson Hyperlegible, menús de vidrio esmerilado y un composer pensado para el teléfono.

No modifica Open WebUI: son dos archivos (`carbono.css` y `carbono.js`) que tu lanzador sirve en lugar de los vacíos que Open WebUI ya carga en cada página (`/static/custom.css` y `/static/loader.js`). Se activa y se quita con un comando y sobrevive a `pip install -U open-webui`.

La guía de estilo (principios, colores, tipografía y componentes) está en [docs/GUIA.md](docs/GUIA.md).

## Capturas

### Escritorio

| Bienvenida con pétalos | Imagen generada y medidor de rendimiento |
| --- | --- |
| ![Bienvenida con el avatar del modelo, la barra lateral rediseñada y pétalos en sus colores](docs/capturas/escritorio-inicio.jpg) | ![Cuadrícula de variaciones de una imagen generada con la barra de métricas](docs/capturas/escritorio-conversacion.jpg) |

| Selector de modelo de la barra | Menú «+» |
| --- | --- |
| ![Selector de modelo abierto desde la tarjeta Modelo activo, con buscador, fijados y todos los modelos](docs/capturas/escritorio-selector-modelo.jpg) | ![Menú «+» con Archivos, Captura, Contexto y herramientas](docs/capturas/escritorio-menu-mas.jpg) |

| Tema oscuro con el detalle de métricas | Modo voz en escritorio |
| --- | --- |
| ![Tema oscuro con la tarjeta de detalle del medidor de rendimiento](docs/capturas/escritorio-oscuro.jpg) | ![Modo voz en escritorio: el chat a la izquierda y el panel de voz a la derecha](docs/capturas/escritorio-voz.jpg) |

### Móvil

| Bienvenida | Barra lateral |
| --- | --- |
| ![Bienvenida en el teléfono con el + y las bolitas de las opciones activas](docs/capturas/movil-inicio.jpg) | ![Barra lateral flotante en el teléfono con modelo activo, fijados, Notas, Espacio y Agenda](docs/capturas/movil-barra.jpg) |

| Menú «+» | Modo voz |
| --- | --- |
| ![Menú «+» en el teléfono con Imagen, Razonamiento y Trabajo](docs/capturas/movil-menu-mas.jpg) | ![Modo voz en el teléfono con el título, el nombre del modelo y Colgar](docs/capturas/movil-voz.jpg) |

## Qué cambia

- **Tipografía:** Atkinson Hyperlegible Next para la interfaz y Atkinson Hyperlegible Mono para código (Google Fonts).
- **Barra lateral:** vidrio claro con el color del modelo activo (tomado de su avatar, como los pétalos), tarjeta «Modelo activo» con su selector, modelos fijados, **Nuevo Chat** en negro con Buscar al lado, píldoras Notas · Espacio · Agenda y chats compactos con el avatar del modelo de cada uno.
- **Chat:** globo de tus mensajes en gris neutro, fondo de cada modelo con un velo blanco degradado y desenfocado para que el texto se lea primero, y barra de título de vidrio esmerilado.
- **Composer en escritorio:** chips neutros con una insignia redonda de color (Herramientas naranja, Web verde, Open Terminal violeta, Razonamiento rosa), una línea que los separa de `+` e Integraciones y, a la derecha, el modelo con su avatar, el micrófono y la voz. Si la caja es angosta, los chips se quedan solo con su insignia.
- **Composer en el teléfono:** texto arriba; abajo `+`, Integraciones, un botón de opciones con las insignias de color de las opciones activas encimadas y un contador «4/4», el modelo con su avatar, el micrófono y la voz. El botón abre la hoja de vidrio **Herramientas y opciones**, donde cada opción tiene su ícono, su descripción y su interruptor encendido o apagado.
- **Menús:** vidrio esmerilado (blanco al 60 % con desenfoque) en todos los menús flotantes y en el selector de modelo; nunca se salen de la ventana y muestran todas sus opciones.
- **Administración y Zona de Pruebas:** pestañas en control segmentado, tabla de usuarios en tarjeta con el rol en píldora, buscador y botones de 46 px, instrucciones del sistema en tarjeta, un recuadro punteado que explica qué hacer cuando no hay mensajes y botón **Ejecutar** en negro.
- **Ajustes:** ventana de vidrio con el menú de pestañas en vidrio y la activa en azul; cada sección es una tarjeta blanca con filas, selectores de 40 px, campos de 42 px, interruptores de 44 × 26 y **Guardar** en una barra de vidrio. En el teléfono abre en un índice (cuenta y secciones agrupadas) y cada sección tiene pestañas en una pista gris.
- **Notas, Espacio de Trabajo, Calendario y Automatizaciones:** jerarquía título › sección › ajuste › descripción y botón **Crear** en negro.
- **Navegador del panel:** barra de vidrio con la dirección en una píldora y, sin página abierta, una tarjeta con un campo para abrir direcciones o buscar y los puertos locales en filas.
- **Generación de imagen:** mientras se genera, una tarjeta con los pasos (Cargando modelo → Generando → Lista) y **Cancelar**; la imagen lista va en un marco con Ampliar, «Lista · tamaño · modelo», botones para descargar, copiar, pedir una variación o regenerar, y el prompt usado.
- **Notificaciones, inicio de sesión y modo voz:** colores de estado del sistema, campos de 44 px y botones de voz de 64 px con su etiqueta.
- **Rendimiento:** los selectores evitan buscar por el atributo `class` dentro de `:has()`, que obliga al navegador a recalcular toda la página en cada hover.

## Cambios

### 0.95.2

- **Barra lateral, diseño final (teléfono):** pantalla completa con la identidad arriba (logo, campana y tu avatar, que abre tu cuenta), «Buscar chats» y Notas · Espacio · Agenda debajo, chats de 48 px con avatar de 24 y título de 16, y abajo, al alcance del pulgar, el modelo activo (con su color) y «Nuevo chat». El selector de modelo y el menú de tu cuenta salen desde abajo como hojas. Se cierra deslizando a la izquierda: la barra sigue al dedo y regresa si no se desliza lo suficiente.
- **Barra lateral, diseño final (escritorio):** la misma estructura a escala de escritorio (320 px, buscador con Ctrl K, chats de 40 px, versión y atajo al pie); el selector de modelo se abre sobre el modelo y tu cuenta junto a tu avatar. La barra contraída no cambia.
- **Estados de los chats:** «Pensando…» con un solo anillo más lento y el texto en el color del modelo; «Respuesta nueva» con título en seminegrita y un punto que late tres veces; con movimiento reducido todo queda quieto.
- **Abrir y cerrar la barra en el teléfono:** el panel sale al instante al tocar y el contenido aparece completo; al tocar un chat la barra empieza a salir en el mismo toque, sin esperar a que cargue; sin parpadeos del fondo.
- **Mensajes en el teléfono:** la respuesta va sin tarjeta y tu mensaje en una burbuja de hasta el 70 % del ancho; márgenes del chat y del cuadro de escribir como en el diseño.
- **Formato del texto:** jerarquía de títulos, negritas reales, viñetas visibles, citas y bloques de código como bloques, encabezados de tabla discretos, espacio entre párrafos y en cada salto de línea, y renglones mejor repartidos (con guiones en palabras largas en el teléfono).
- **Editar mensaje y métricas:** tarjetas de vidrio, modo de edición con «Guardar y enviar» y aviso de lo que se reemplaza; en el teléfono solo el botón de la gráfica.
- **Modo voz:** la pantalla de llamada se abre en círculo desde el botón de llamada con una entrada en cascada; medidor del micrófono más calmado; al volver al chat se cierra sin animación ni fondo oscuro; «Razonar» apagado ya no lleva etiqueta.
- **Visor de imágenes:** zoom de 1× a 5× (pellizco, rueda o doble toque) sin que la imagen se salga de la pantalla; la X ya no vuelve a abrir la imagen de atrás.
- **Otros:** bienvenida sin animación en la foto y el saludo; ventana de pestañas del teléfono a pantalla completa sin esquinas ni fondo oscuro; íconos de modelos subidos en WebP se procesan para pesar menos.

### 0.95.1

- **Barra lateral rediseñada:** cada chat lleva el avatar y el color del modelo con el que se habló (tomado del avatar, como los pétalos); aro mientras genera, punto si hay respuesta sin leer y barra del color en el chat abierto. Filas compactas (32 px en escritorio, 40 px en el teléfono) para que quepan más chats.
- **Encabezado de la barra:** «Sakura OI Web» más grande con la versión debajo; campana y contraer del mismo tamaño y alineados.
- **Tarjeta «Modelo activo» y selector:** al tocarla se abre un panel con buscador, fijados y todos los modelos (tipo, chincheta para fijar o quitar y palomita en el activo); elegir y fijar usan el selector de Open WebUI, así que todo se guarda igual.
- **Buscar** junto a **Nuevo Chat** en gris oscuro; **Notas · Espacio · Agenda** como píldoras (Agenda abre el Calendario de Open WebUI, si lo fijas en la barra).
- **Tarjeta del usuario:** el engrane abre Ajustes directo; el resto de la tarjeta abre el menú, que ahora va alineado con la tarjeta y con todas sus opciones a la misma altura.
- **Chat en pantalla ancha:** interruptor Compacta / Ampliada en la barra de pestañas (solo íconos si hay poco espacio), pestañas deslizables con flechas, hora y nombre en el encabezado de cada mensaje.
- **Medidor de rendimiento:** barra con borde gris y botón que abre debajo el detalle en lista (tiempo total, primera palabra, velocidad, contexto, memoria, imagen y desglose del tiempo); en el teléfono, barra corta con lo principal.
- **Generación de imagen:** imagen sin sombra ni redondeo, encuadrada según su proporción, con la barra de acciones unida abajo; las variaciones se muestran en cuadrícula mientras se generan.
- **Modo voz (azul y negro):** encabezado «Modo voz» con «● Escuchando · 0:42», nombre del modelo bajo el avatar, «Colgar» en el teléfono, aparece con un fundido y sin esquinas redondeadas; se acomoda en pantallas altas y bajas.
- **Accesibilidad (tres rondas, claro y oscuro):** en el teléfono los botones miden de 40 a 44 px (barra, encabezado, mensajes, imágenes, métricas y «Pensando durante…»), mejor contraste en horas, rótulos y textos secundarios, y márgenes iguales a los dos lados de la barra.
- **Más fluido:** los 26 observadores de cambios del tema son ahora uno solo compartido que avisa a cada parte solo de lo que le toca; mientras la respuesta se escribe se agrupan los avisos (cada 120 ms) y con la pestaña oculta no trabaja. Sin cambios en animaciones ni imágenes.
- **Correcciones:** ya no se abre una pestaña «Inicio» al empezar el modo voz en el teléfono ni al cambiar el ancho de la ventana, y la barra del teléfono cerrada no deja una orilla a la vista.

### 0.95

- **Pestaña Navegador:** barra de 56 px en vidrio con botones de 38 px y la dirección en una píldora blanca con candado; «Abrir en ventana nueva» fuera de la píldora. Sin página abierta, una tarjeta de 560 px con insignia verde, el campo «Escribe una dirección o busca» con **Abrir** (acepta `localhost:3000`, `:3000`, dominios o texto para buscar), «Puertos locales» con **Buscar de nuevo** y cada puerto en una fila con punto verde, `localhost:puerto`, el proceso y **Abrir**. La pestaña se llama «Navegador» en lugar de «Browser».
- **Revisión de menús:**
  - Selectores con buscador del editor de modelos (Herramientas, Conocimiento, Habilidades, Filtros): las filas ya no se enciman, buscador en píldora, rótulos de sección en mayúsculas, «sin resultados» centrado, sin marco doble y pie con Limpiar · Gestionar · **Hecho** como píldoras.
  - Versiones del modelo («Producción»): filas de 44 px con avatar, identificador en monoespaciada, fecha en gris e insignia verde; Anterior y Siguiente como píldoras.
  - Opciones de radio y casilla, y botones sueltos (Permisos de Herramientas, filtros de Notas, opciones del navegador) a 38 px y 15 px; el campo de etiquetas del menú del chat a 14 px.
  - Sin aros azules dentro de los menús: la opción enfocada con el teclado se marca en gris.
- **Ventana «Añadir control»** (controles del modelo): tarjeta de 440 px, campos de 36 px con filo, «Mostrar» como control segmentado, cada opción en su propia tarjeta, «Añadir opción» con borde punteado y pie con píldoras.
- **Notificaciones:** el aviso de «respondió» de un chat es de vidrio, con avatar de 36 px, título de 14.5 px y la X en un círculo (las reglas del modo voz ya no le ponen un punto verde). El panel de la campana usa rótulos en mayúsculas, filas más grandes y, sin notificaciones, una campana en círculo.
- **Editar un mensaje propio:** el editor queda a la derecha, donde estaba el globo, como una tarjeta de hasta 720 px parecida a la caja de escribir; Guardar, Cancelar y Enviar como píldoras.
- **Ajustes rediseñados (escritorio):** las 27 pestañas, personales y de administrador, con ventana de vidrio, menú de 260 px en vidrio con la pestaña activa en azul, título de 26 px con una línea que explica la pestaña, tarjetas por sección (en Interfaz, una por grupo), selectores de 40 px, campos de 42 px, interruptores de 44 × 26, botones de texto en píldora y **Guardar** en una barra de vidrio de orilla a orilla.
- **Ajustes rediseñados (teléfono):** pantalla completa; primero un índice con título, buscador, tu tarjeta de cuenta y las secciones agrupadas como en el menú de Open WebUI; cada sección con «‹ Ajustes», pestañas deslizables en una pista gris, selector o campo a lo ancho debajo de la etiqueta, interruptores de 48 × 28 y **Guardar** de 48 px en una barra de vidrio.
- **Generación de imagen en el chat:** mientras corre `generate_image` o `edit_image`, una tarjeta con los pasos Cargando modelo → Generando → Lista, un lienzo con brillo y **Cancelar**; con el bloque opcional del lanzador (ver «Instalar») muestra si ComfyUI está cargando el modelo y el porcentaje con «Paso n de m». La imagen lista va en un marco de 20 px con sombra, Ampliar, «Lista · 1024×1024 · modelo», Descargar, Copiar, Variaciones (escribe la petición en la caja, sin enviarla), Regenerar y «Prompt usado».
- **Teléfono, menú de usuario:** alineado con la barra lateral (10 px a cada lado), esquinas de 20 px, fila del perfil de 52 px y opciones de 44 px a 16 px.

### 0.94

- **Modo voz animado (azul y negro):** el avatar se queda a la vista en todos los estados (Open WebUI lo cambiaba por un ícono de carga al pensar y responder, y por el emoji en las reacciones).
  - **Escuchando:** el avatar crece un poco con tu voz y salen ondas azules; 9 barras azules siguen el volumen. Solo se anima mientras detecta sonido y vuelve a la calma con una transición suave.
  - **Pensando:** el avatar respira, un aro azul gira y una burbuja con tres bolitas aparece arriba a la derecha.
  - **Respondiendo:** el avatar habla y salen ondas suaves; cada reacción de la persona (😊…) sale con un rebote en un círculo blanco abajo a la derecha.
  - **Silenciado:** el avatar queda en gris y quieto, con aro punteado, insignia del micrófono tachado y barras planas.
  - Píldora de estado con ícono y texto («Te escucho…», «Pensando…», «Toca para interrumpir», «Micrófono silenciado»); botones de 64 px con etiqueta en español: Cámara en blanco, Silenciar y Finalizar en negro, y Silenciar en rojo solo cuando el micrófono está silenciado. La pestaña del modo voz lleva el subrayado azul. Con «reducir movimiento» del sistema la escena queda quieta.
- **Botones del modo voz:** cuatro de 60 px (Cámara · Razonar · Silenciar · Finalizar). **Razonar** es nuevo: rosa con el nivel en una etiqueta (gris en Apagado) y abre una hoja con el vidrio de los menús para elegir el nivel (Apagado, Bajo, Medio, Alto, Adaptable), usando el mismo control de Razonamiento del chat. El avatar se queda siempre fijo y del mismo tamaño; la animación va alrededor.
- **Razonamiento automático en el modo voz:** al iniciar la llamada pasa a Apagado y al salir vuelve al nivel que tenías (se recuerda aunque la página se recargue a media llamada).
- **Silenciado en rojo:** insignia del micrófono tachado, píldora y botón «Activar mic.».
- **Vidrio:** el área del modo voz lleva el mismo vidrio que la barra de pestañas (blanco al 42 % con desenfoque), así se leen como una sola pieza.
- **Modo voz en escritorio con el chat a la vista:** el chat se queda a la izquierda y la voz en un panel de 420 px con su propia pestaña encima; tocar el chat ya no oculta la voz. Con la vista dividida el orden es chat · voz · columna de la derecha. Al achicar la ventana a tamaño teléfono durante una llamada, el modo voz sigue a la vista.
- **Nuevas capturas** del modo voz en el teléfono y en escritorio.

### 0.90

- **Menú «+» reorganizado:** arriba tres botones grises del mismo tamaño (Archivos · Captura · Contexto) con el ícono sobre el nombre; luego Herramientas (Herramientas, Búsqueda web, Intérprete de código) y al final Permisos. Las opciones apagadas llevan la insignia gris y el nombre atenuado; Herramientas sin ninguna elegida dice «Ninguna seleccionada».
- **Teléfono, todo en el menú «+»:** la caja de mensaje lleva solo el «+» con una bolita de color por opción activa. Imagen (tamaño, interruptor y flecha al panel de tamaños) y Razonamiento (nivel) tienen su fila en el menú, y el grupo Trabajo reúne Workspace y Open Terminal (con interruptor: elige la última terminal o la quita).
- **Búsqueda web e Intérprete de código solo en el menú «+»:** ya no tienen chip en la caja de mensaje.
- **Chips apagados en gris:** insignia gris rellena; Open Terminal sin terminal conserva su nombre (desde 0.13.3 Open WebUI lo quitaba).
- **Escritorio, caja angosta:** si los chips con texto no caben, pasan a bolitas de color de 30 px (antes se recortaban tras el desvanecido).
- **Bienvenida con pétalos por modelo:** el avatar va grande y centrado con aro, sombra y siete pétalos en los colores de su ícono. Los colores se sacan del propio avatar (un lienzo de 32 × 32, ~0,1 ms) cada vez que cambia, así que un ícono o un modelo nuevo toma sus colores solo. El avatar ya no muestra la mano del cursor (el botón de Open WebUI no hacía nada).
- **Barra lateral contraída de 60 px:** botones de 40 px, íconos de 19 px y avatares de 28 px, más fáciles de tocar.
- **Campana de notificaciones** del mismo tamaño y trazo que el botón de la barra lateral, y separada de él.
- **Ajustes en el teléfono:** la fila de pestañas se desliza con el dedo, la rueda o arrastrando, se desvanece a la derecha mientras haya más y la lupa es un botón visible.
- **Panel de Imagen:** en el teléfono mide lo que necesita.

### 0.89

- **Probado con Open WebUI 0.13.3:** sin cambios de diseño; el bloque opcional del chat en pestaña sigue funcionando (el lanzador busca el archivo por su contenido, así que no importa que cambie de nombre). Después de actualizar Open WebUI con `pip`, vuelve a aplicar tus íconos si los reemplazaste: la actualización restaura los originales.

### 0.88

- **Panel de Imagen:** el subtítulo reconoce el modelo configurado (Z-Image-Turbo, FLUX o el nombre del archivo sin extensión) en vez de mostrar el nombre completo, y la nota del tamaño 1024×1024 ya no habla de FLUX («la más equilibrada»).

### 0.87

- **Menús más compactos y parejos:** el menú «+», el selector de Workspace, el de modelo, la lista de Herramientas, el menú de Razonamiento y la hoja «Herramientas y opciones» del teléfono comparten medidas: filas de 42 px (46 px en el teléfono) con 1 px entre ellas, íconos redondos de 28 px, texto de 14 px e interruptores de 40 × 24. La lista de Herramientas crece hasta ~470 px para ver más herramientas sin desplazarse.
- **Razonamiento rediseñado:** encabezado con el nivel en una pastilla rosa y un control segmentado de cinco niveles (Apagado · Bajo · Medio · Alto · Adaptable) en lugar del deslizador; sigue moviendo el deslizador original, así que se guarda igual.
- **Imagen (generación de imágenes):** chip siempre a la vista, rojo encendido y con contorno gris apagado. Tocarlo abre un panel de vidrio con el interruptor y el tamaño de la imagen (1024×1024, vertical, horizontal, retrato… con su velocidad relativa); el tamaño es el ajuste `IMAGE_SIZE` de Open WebUI y solo lo cambian los administradores. La opción sale del menú «+».
- **Chips apagados en gris:** Web e Imagen dejan un chip gris al apagarlas (tocarlo las vuelve a encender sin que se vea el menú), y Open Terminal sin terminal y Razonamiento en Apagado llevan la insignia gris. Herramientas sale de la caja de mensaje (sigue en el menú «+»). Con «Mostrar selecciones en la entrada» encendido aparecen los chips de Web e Imagen.
- **Workspace en el teléfono:** vive dentro del menú «+» (grupo Herramientas) y ya no cuenta en el contador de opciones.
- **Visor de imágenes:** sin la barra blanca; fondo oscuro translúcido y botones redondos de vidrio de 44 px para cerrar y descargar. Un toque o clic fuera de la imagen lo cierra (no al arrastrar o ampliar).
- **Carga más rápida:** el avatar del modelo, el chip de Razonamiento y los avatares de la barra contraída usan la lista de modelos guardados (`/api/v1/models/list`, milisegundos) en vez de `/api/models` (segundos); la lista completa solo se pide si hace falta. El avatar del chip también se actualiza cuando Open WebUI solo cambia el nombre del modelo.
- **Encabezado del teléfono:** los íconos de chat temporal, panel, nuevo chat y acciones con el mismo tamaño y trazo que en escritorio y repartidos parejo, cada uno con área táctil de 44 px.
- **Chats en pestaña** (chat lateral): la caja de mensaje lleva el mismo diseño que la del chat principal (chips, avatar, Razonamiento).
- Corregido: el círculo de carga de los chats también mide 44 px (antes se veía uno grande y luego uno chico), el contador «3/3» del teléfono centrado, y al achicar la ventana con vista dividida se cierra el cajón de pestañas y queda el chat.

### 0.86

Ajustes para Open WebUI 0.13.2:

- **Pestañas como barra de título:** 0.13.2 pone las pestañas del chat arriba y deja vacío el encabezado viejo; ahora hay una sola barra de vidrio de 52 px. Las pestañas son planas: la activa va en negrita con su ícono y un subrayado de 3 px en el color de su tipo (chat azul, terminal durazno, archivo/editor magenta, navegador verde, archivos turquesa, escritorio rojo, nota de voz amarillo). El «+» y los botones de la derecha miden 34 px.
- **Vista dividida:** cada lado guarda lugar solo para sus botones, la división es una línea sutil y el contenido ya no queda debajo de la barra. Al achicar la ventana a tamaño teléfono se cierra el cajón de pestañas que abría Open WebUI y queda el chat.
- **Workspace** (carpeta de trabajo de 0.13.2): chip con insignia turquesa y el nombre de la carpeta (o «Workspace»); selector rediseñado con encabezado, buscador y filas de 48 px. En el teléfono vive dentro del menú «+», en el grupo Herramientas.
- **Menú «+» rediseñado:** grupos Adjuntar, Herramientas y Permisos con su rótulo, filas de 48 px con ícono redondo y descripción, interruptor de Búsqueda web más grande, y anclado justo arriba de la caja de mensaje.
- **Colores de los chips:** Open Terminal durazno, Workspace turquesa, Herramientas violeta índigo (también en su lista), Razonamiento rosa y Web verde.
- **Navegador de archivos:** en el teléfono, barra y filas de 56 px con botones de 44 px; en escritorio, una versión compacta.
- **Chats en pestaña** («Nuevo Chat» del menú de pestañas): su caja de mensaje usa el mismo diseño que la del chat principal. Opcionalmente el lanzador puede mostrar ahí Open Terminal y Workspace (ver «Instalar»).
- Corregido: doble línea junto al «+», íconos de la barra de título del teléfono con el mismo trazo que en escritorio, contador «4/4» centrado y la división vieja del panel que tapaba parte del otro lado.

### 0.85

- Composer rediseñado («Composer elegido»): chips neutros con insignia redonda de color e ícono blanco, línea divisoria y el avatar del modelo en su chip; en el teléfono, el botón de opciones muestra las insignias encimadas y un contador «4/4», y la hoja usa las mismas insignias.
- Barra lateral contraída: botón **Chats** que abre un panel de vidrio con carpetas (y crear carpeta), fijados e historial por fecha con buscador, y avatares de los modelos fijados para empezar un chat nuevo.
- Panel lateral de pestañas de 0.13.0 (Archivos, Terminal, Navegador, Desktop): pestañas compactas con la activa marcada, íconos gris oscuro del mismo tamaño, barra de la misma altura que la de título, línea fina de separación con el chat y menú «+» de vidrio.
- Ventana **Herramientas Disponibles** de vidrio, como los menús.
- Íconos de la barra de título más oscuros y parejos.
- El chip Razonamiento sigue apareciendo solo en modelos con nivel de razonamiento.

### 0.84

Ajustes para Open WebUI 0.13.0:

- El chip **Razonamiento** solo aparece con los modelos que tienen nivel de razonamiento (`model_controls`). En 0.13.0 ese botón es «Controles del modelo» y se muestra a los administradores con cualquier modelo; con los demás modelos se queda junto al modelo como ícono normal (en el teléfono se oculta para que quepa el nombre del modelo).
- Corregido: la hoja **Herramientas y opciones** volvía a desenfocar solo la caja de escribir y no el chat de atrás (0.13.0 le pone su propio desenfoque a la caja).
- Corregido: el botón **Enviar** al editar un mensaje se veía negro sin texto (el editor ahora vive dentro del globo del mensaje).
- Corregido: en Administración › Modelos la primera fila salía más chica y la lista no se podía desplazar (comparte `#model-list` con el Espacio de Trabajo); ahora se desplaza y la barra se ve siempre.
- Espacio de Trabajo: pestañas en control segmentado, como Administración, y el botón **Crear** ya no se sale por la derecha en ventanas angostas.
- Composer en escritorio: los chips se comprimen a solo ícono cuando no caben.
- Teléfono: el contador del botón de opciones es un óvalo con el total y las activas; la hoja muestra cada opción encendida o apagada, y Búsqueda web y Herramientas siguen en la hoja al apagarlas (tocarlas las vuelve a encender desde Integraciones).
- Modo oscuro: los interruptores de la hoja se distinguen (pista clara y perilla oscura).

### 0.83

- Teléfono: el velo blanco sobre el fondo del chat es 1 % más transparente, para que se note un poco más el fondo de cada modelo.
- Nueva guía de estilo en [docs/GUIA.md](docs/GUIA.md). Toda la documentación del tema vive ahora en este repositorio.

### 0.82

- Corregido: en Ajustes › Integraciones, el engrane de cada servidor de herramientas (por ejemplo GitHub) se veía como un puntito; los botones de solo ícono ya no llevan relleno y el ícono mide 16 px.
- El buscador del menú izquierdo de Ajustes tiene 10 px de separación con la primera opción.

### 0.81

- Barra lateral y menús 2 px más grandes (15 px en escritorio, 18 px en el teléfono); el menú de usuario mide lo mismo que la barra.
- Administración y Zona de Pruebas rediseñadas.
- Caja de escribir más baja (menos margen arriba y abajo del texto).
- La hoja **Herramientas y opciones** del teléfono ya no oscurece ni desenfoca el resto de la pantalla.
- Mientras el tema está activo se desactiva el modo de alto contraste de Open WebUI, que oscurecía los grises y chocaba con la paleta; al quitar el tema vuelve a funcionar.
- Corregido: la X para quitar un archivo adjunto se veía como un círculo negro grande que tapaba el nombre.
- Corregido: el botón **Enviar** al editar un mensaje se veía negro sin texto.

### 0.80

- Primera versión publicada: tipografía Atkinson Hyperlegible, menús de vidrio esmerilado, composer de escritorio con chips de color y composer del teléfono con la hoja **Herramientas y opciones**.

## Instalar

1. Copia la carpeta [carbono](carbono) dentro de la carpeta de tu Open WebUI, en `temas\carbono`, junto a tu lanzador:

   ```text
   Open WebUI\
   ├─ Scripts\python.exe
   ├─ run_open_webui_https.py
   └─ temas\
      └─ carbono\
         ├─ carbono.css
         ├─ carbono.js
         ├─ tema.py
         ├─ Aplicar-Tema.cmd
         └─ Quitar-Tema.cmd
   ```

2. Agrega a tu lanzador este bloque, justo después de `import open_webui.main` y antes de `uvicorn.run(...)`. `script_dir` es la carpeta del lanzador (`Path(__file__).resolve().parent`).

   ```python
   # Tema Carbono: mientras exista temas/carbono/ACTIVO, /static/custom.css y /static/loader.js
   # se sirven desde temas/carbono/. WEBUI_THEME_NAME cambia opcionalmente el nombre de la app.
   from starlette.responses import Response

   tema_dir = script_dir / "temas" / "carbono"
   tema_archivos = {
       "/static/custom.css": ("carbono.css", "text/css"),
       "/static/loader.js": ("carbono.js", "text/javascript"),
   }
   tema_nombre = os.environ.get("WEBUI_THEME_NAME")
   nombre_original = open_webui.main.app.state.WEBUI_NAME


   @open_webui.main.app.middleware("http")
   async def tema_carbono(request, call_next):
       activo = (tema_dir / "ACTIVO").exists()
       if tema_nombre:
           open_webui.main.app.state.WEBUI_NAME = tema_nombre if activo else nombre_original
       if request.url.path not in tema_archivos:
           return await call_next(request)
       nombre, media_type = tema_archivos[request.url.path]
       archivo = tema_dir / nombre
       body = archivo.read_bytes() if activo and archivo.is_file() else b""
       return Response(body, media_type=media_type, headers={"Cache-Control": "no-cache"})
   ```

3. Reinicia Open WebUI **una sola vez** para que cargue el bloque.

Opcional (Open WebUI 0.13.2 y 0.13.3): los chats que se abren como pestaña («Nuevo Chat» del menú de pestañas) llegan sin Open Terminal ni Workspace porque Open WebUI los oculta en ese componente, aunque al enviar ya usa la terminal elegida. Para mostrarlos, agrega esto antes del `@open_webui.main.app.middleware` (con `import json` arriba):

```python
# Chats en pestaña con Open Terminal y Workspace: se sirve ese archivo con el interruptor encendido.
# Si una versión nueva cambia el código, no se encuentra la marca y no se toca nada.
chat_lateral_marca = b"embedded:!0,callEnabled:!1,terminalSelectionEnabled:!1"
chat_lateral_ruta, chat_lateral_cuerpo = None, b""
_chunks = Path(open_webui.__file__).resolve().parent / "frontend" / "_app" / "immutable" / "chunks"
for _js in _chunks.glob("*.js") if _chunks.is_dir() else []:
    _datos = _js.read_bytes()
    if chat_lateral_marca in _datos:
        chat_lateral_ruta = f"/_app/immutable/chunks/{_js.name}"
        chat_lateral_cuerpo = _datos.replace(chat_lateral_marca, chat_lateral_marca[:-1] + b"0")
        break
```

y esto al inicio de `tema_carbono`, después de `activo = ...`:

```python
    if activo and chat_lateral_ruta and request.url.path == chat_lateral_ruta:
        return Response(chat_lateral_cuerpo, media_type="text/javascript", headers={"Cache-Control": "no-cache"})
    if request.url.path == "/static/carbono-parches.json":
        rutas = [chat_lateral_ruta] if activo and chat_lateral_ruta else []
        return Response(json.dumps({"recargar": rutas}), media_type="application/json", headers={"Cache-Control": "no-cache"})
```

`carbono.js` consulta `/static/carbono-parches.json` para refrescar una vez ese archivo en la caché del navegador (puede recargar la página una sola vez).

Opcional: al generar una imagen, `generate_image` ya la muestra en el chat, pero si el modelo además llama `display_file` Open WebUI abre el visor de archivos (una pestaña, o un cajón en el teléfono). Para que no se abra con las imágenes recién generadas (se guardan con nombre UUID), agrega esto antes del `@open_webui.main.app.middleware`:

```python
import re
import open_webui.utils.middleware as owui_middleware

imagen_generada = re.compile(
    r"(^|[\\/])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpe?g|webp|gif)$", re.I
)
terminal_event_handler_original = owui_middleware.terminal_event_handler


async def terminal_event_handler_sin_visor(nombre, parametros, resultado, emisor):
    if nombre == "display_file" and imagen_generada.search(str((parametros or {}).get("path", ""))):
        return
    return await terminal_event_handler_original(nombre, parametros, resultado, emisor)


owui_middleware.terminal_event_handler = terminal_event_handler_sin_visor
```

Opcional (solo con ComfyUI): para que la tarjeta de generación de imagen muestre si se está cargando el modelo y el porcentaje con «Paso n de m», y para que **Cancelar** detenga ComfyUI, agrega esto antes del `@open_webui.main.app.middleware` (con `import json` arriba). Solo mira los mensajes que ComfyUI le manda a Open WebUI, sin cambiarlos; las dos direcciones piden la sesión de Open WebUI. Sin este bloque la tarjeta muestra «Generando imagen…» con una barra que corre.

```python
import time
import aiohttp
import open_webui.utils.images.comfyui as owui_comfyui
from open_webui.models.config import Config as OwuiConfig
from open_webui.utils.auth import decode_token

imagen_estado = {"estado": None}
ws_get_images_original = owui_comfyui._ws_get_images


def imagen_observar(mensaje, flujo):
    tipo, datos = mensaje.get("type"), mensaje.get("data") or {}
    if tipo == "executing" and datos.get("node") is not None:
        clase = str((flujo.get(str(datos["node"])) or {}).get("class_type", ""))
        if "Loader" in clase and imagen_estado.get("estado") in ("iniciando", "cargando"):
            imagen_estado["estado"] = "cargando"
    elif tipo == "progress":
        imagen_estado.update(estado="generando", paso=datos.get("value", 0), pasos=datos.get("max", 0))


class WsEspia:
    def __init__(self, ws, flujo):
        self._ws, self._flujo = ws, flujo

    def __getattr__(self, nombre):
        return getattr(self._ws, nombre)

    def __aiter__(self):
        return self._leer()

    async def _leer(self):
        async for msg in self._ws:
            if msg.type == aiohttp.WSMsgType.TEXT:
                try:
                    imagen_observar(json.loads(msg.data), self._flujo)
                except Exception:
                    pass
            yield msg


async def ws_get_images_espia(ws, workflow, client_id, base_url, api_key):
    imagen_estado.clear()
    imagen_estado.update(estado="iniciando", inicio=time.time(), paso=0, pasos=0, _base=base_url, _clave=api_key)
    try:
        resultado = await ws_get_images_original(WsEspia(ws, workflow), workflow, client_id, base_url, api_key)
    except Exception:
        imagen_estado.update(estado="error", fin=time.time())
        raise
    imagen_estado.update(estado="lista", fin=time.time())
    return resultado


owui_comfyui._ws_get_images = ws_get_images_espia


def sesion_valida(request):
    token = request.cookies.get("token") or ""
    autorizacion = request.headers.get("authorization", "")
    if autorizacion.lower().startswith("bearer "):
        token = autorizacion[7:]
    return bool(token) and decode_token(token) is not None


async def imagen_respuesta(request):
    if not sesion_valida(request):
        return Response(status_code=401)
    if request.url.path.endswith("-cancelar"):
        if request.method != "POST":
            return Response(status_code=405)
        base = imagen_estado.get("_base")
        if base and imagen_estado.get("estado") in ("iniciando", "cargando", "generando"):
            async with aiohttp.ClientSession() as sesion:
                await sesion.post(f"{base}/interrupt", headers={"Authorization": f"Bearer {imagen_estado.get('_clave') or ''}"})
            imagen_estado.update(estado="cancelada", fin=time.time())
        return Response(status_code=204)
    datos = {k: v for k, v in imagen_estado.items() if not k.startswith("_")}
    datos["ahora"] = time.time()
    datos["modelo"] = await OwuiConfig.get("image_generation.model", "") or ""
    return Response(json.dumps(datos), media_type="application/json", headers={"Cache-Control": "no-cache"})
```

y esto al inicio de `tema_carbono`, después de `activo = ...`:

```python
    if activo and request.url.path in ("/static/carbono-imagen.json", "/static/carbono-imagen-cancelar"):
        return await imagen_respuesta(request)
```

Opcional: define la variable de entorno `WEBUI_THEME_NAME` (por ejemplo, `Sakura OI Web`) para cambiar el nombre que se ve en la barra lateral, el inicio de sesión y la pestaña mientras el tema está activo. Revisa la [licencia de Open WebUI](https://docs.openwebui.com/license) antes de cambiar su marca.

## Activar, quitar y ver el estado

Haz doble clic en `temas\carbono\Aplicar-Tema.cmd` o `Quitar-Tema.cmd`, o desde PowerShell en la carpeta de Open WebUI:

```powershell
.\Scripts\python.exe .\temas\carbono\tema.py aplicar
```

```powershell
.\Scripts\python.exe .\temas\carbono\tema.py quitar
```

```powershell
.\Scripts\python.exe .\temas\carbono\tema.py estado
```

`aplicar` crea `temas\carbono\ACTIVO` y `quitar` lo borra. Ninguno reinicia el servidor: recarga la página con **Ctrl+F5**. En el teléfono, cierra la app o la pestaña y vuelve a abrirla para que no use la versión en caché. `estado` avisa si el lanzador no tiene el bloque del tema.

Al quitarlo se desactivan a la vez los estilos, el comportamiento de `carbono.js` y el nombre opcional: Open WebUI vuelve a verse como el original.

## Actualizaciones de Open WebUI

El tema vive fuera de `site-packages`, así que `pip install -U open-webui` no lo borra. Tampoco se usa `open_webui/static/custom.css`, porque Open WebUI vacía esa carpeta cada vez que arranca.

Si una actualización cambia algún elemento, esa regla deja de aplicarse y esa parte vuelve al estilo original de Open WebUI; no se rompe nada.

## Personalizar

Los colores están como variables al inicio de `carbono.css` (`--sk-bg`, `--sk-ink`, `--sk-primary`…), con su versión oscura en `html.dark`. Los ajustes del teléfono están en los bloques `@media (max-width: 767px)`. Cambia los valores y recarga con Ctrl+F5.

## Limitaciones

- Algunos detalles dependen de cómo Open WebUI arma su HTML (por ejemplo, cada chip se reconoce por el dibujo de su ícono). Si cambian en una versión futura, esos detalles vuelven al estilo original.
- `carbono.js` mueve el botón de Razonamiento junto a los demás chips (solo en modelos con nivel de razonamiento), crea el botón de opciones del teléfono y desactiva el modo de alto contraste de Open WebUI mientras el tema está activo. Para saber qué modelos razonan lee `/api/models` y los ajustes del usuario con su propia sesión.
- Volver a encender Búsqueda web desde la hoja del teléfono busca la opción «Búsqueda Web» en el menú de Integraciones, así que funciona con Open WebUI en español.
- En el teléfono, la hoja **Herramientas y opciones** muestra las opciones activas; para activar otra, usa el botón de Integraciones.
- El bloque del lanzador está pensado para un solo worker de uvicorn, que es el valor por defecto.
