# Carbono para Open WebUI

**Versión 0.80** · probado con Open WebUI **0.12.5**

Carbono es el tema recomendado para [Sakura OI Web](https://github.com/YukiChristian/Sakura-OI-Web). Deja la interfaz de Open WebUI neutra (superficies en tonos carbón y zinc, acción principal en negro), con más jerarquía en el texto, tipografía Atkinson Hyperlegible, menús de vidrio esmerilado y un composer pensado para el teléfono.

No modifica Open WebUI: son dos archivos (`carbono.css` y `carbono.js`) que tu lanzador sirve en lugar de los vacíos que Open WebUI ya carga en cada página (`/static/custom.css` y `/static/loader.js`). Se activa y se quita con un comando y sobrevive a `pip install -U open-webui`.

## Capturas

### Escritorio

| Inicio | Conversación |
| --- | --- |
| ![Pantalla de inicio en escritorio](docs/capturas/escritorio-inicio.jpg) | ![Conversación en escritorio](docs/capturas/escritorio-conversacion.jpg) |

| Integraciones | Selector de modelo |
| --- | --- |
| ![Menú de integraciones](docs/capturas/escritorio-integraciones.jpg) | ![Selector de modelo](docs/capturas/escritorio-selector-modelo.jpg) |

### Móvil

| Composer | Herramientas y opciones |
| --- | --- |
| ![Composer en el teléfono](docs/capturas/movil-inicio.jpg) | ![Hoja de herramientas y opciones](docs/capturas/movil-opciones.jpg) |

## Qué cambia

- **Tipografía:** Atkinson Hyperlegible Next para la interfaz y Atkinson Hyperlegible Mono para código (Google Fonts).
- **Barra lateral:** filas del mismo tamaño, chat activo con fondo gris y barra de 3 px, etiquetas de sección en mayúsculas.
- **Chat:** globo de tus mensajes en gris neutro, fondo de cada modelo con un velo blanco degradado y desenfocado para que el texto se lea primero, y barra de título de vidrio esmerilado.
- **Composer en escritorio:** chips de color con su nombre (Herramientas en naranja, Web en verde, Open Terminal en violeta, Razonamiento en amarillo) y, a la derecha, modelo, micrófono y voz.
- **Composer en el teléfono:** texto arriba; abajo `+`, Integraciones, un botón de opciones con el número de opciones activas, el modelo, el micrófono y la voz. El botón de opciones abre la hoja de vidrio **Herramientas y opciones**, donde cada opción activa tiene su ícono, su descripción y su interruptor.
- **Menús:** vidrio esmerilado (blanco al 60 % con desenfoque) en todos los menús flotantes y en el selector de modelo; nunca se salen de la ventana y muestran todas sus opciones.
- **Ajustes, Notas, Espacio de Trabajo, Calendario y Automatizaciones:** jerarquía título › sección › ajuste › descripción y botón **Crear** en negro.
- **Notificaciones, inicio de sesión y modo voz:** colores de estado del sistema, campos de 44 px y botones de voz de 64 px con su etiqueta.
- **Rendimiento:** los selectores evitan buscar por el atributo `class` dentro de `:has()`, que obliga al navegador a recalcular toda la página en cada hover.

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

2. Agrega a tu lanzador este bloque, justo después de `import open_webui.main` y antes de `uvicorn.run(...)`. El lanzador de [Sakura OI Web](https://github.com/YukiChristian/Sakura-OI-Web) ya lo incluye. `script_dir` es la carpeta del lanzador (`Path(__file__).resolve().parent`).

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
- `carbono.js` mueve el botón de Razonamiento junto a los demás chips y crea el botón de opciones del teléfono.
- En el teléfono, la hoja **Herramientas y opciones** muestra las opciones activas; para activar otra, usa el botón de Integraciones.
- El bloque del lanzador está pensado para un solo worker de uvicorn, que es el valor por defecto.
