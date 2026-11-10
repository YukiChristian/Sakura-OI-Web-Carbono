/*
 * Carbono 0.88 — comportamiento del tema. El lanzador lo sirve en /static/loader.js
 * (que Open WebUI carga en cada página) mientras exista carbono/ACTIVO.
 *
 * Barras de desplazamiento que solo aparecen mientras haces scroll: carbono.css las deja
 * transparentes y aquí se marca con .sk-scrolling el elemento que se está desplazando.
 */
/* Open WebUI 0.13.2 abre chats en pestañas ("chat lateral") con su propia caja de mensaje y repite ids
   como #model-selector-model-button; la pestaña oculta sigue en la página. skVisible() devuelve el elemento
   que se ve (o el primero si ninguno se ve) para que cada módulo trabaje sobre la caja activa. */
function skVisible(selector) {
	const todos = document.querySelectorAll(selector);
	for (const el of todos) if (el.getClientRects().length) return el;
	return todos[0] ?? null;
}

(() => {
	const VISIBLE_MS = 900;
	const timers = new WeakMap();

	document.addEventListener(
		'scroll',
		(e) => {
			const el = e.target === document ? document.documentElement : e.target;
			if (!(el instanceof Element)) return;
			el.classList.add('sk-scrolling');
			clearTimeout(timers.get(el));
			timers.set(
				el,
				setTimeout(() => el.classList.remove('sk-scrolling'), VISIBLE_MS)
			);
		},
		{ capture: true, passive: true }
	);
})();

/*
 * Composer: el botón "Controles del modelo" (ícono de controles) se convierte en el chip Razonamiento y
 * se mueve a la fila de chips, después de Terminal (mockups G e I), solo si el modelo elegido tiene
 * nivel de razonamiento (model_controls). Desde 0.13.0 Open WebUI muestra ese botón a los
 * administradores en cualquier modelo (también abre archivos, prompt del sistema y parámetros); con
 * los demás modelos se queda junto al modelo como ícono normal.
 */
(() => {
	const CHIPS = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) > div[dir='ltr'] > div:nth-child(2) > div";
	const DERECHA = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) > div[dir='ltr'] > div:last-child";
	const BOTON = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) button:has(path[d^='M10.5 6h9.75'])";
	const MODELO = '#model-selector-model-button';
	let conRazonamiento = null; // nombre del modelo -> { id, predeterminado } si tiene nivel de razonamiento
	let elecciones = {}; // id del modelo -> { razonamiento: nivel } elegido por el usuario (Ajustes)
	let idPorNombre = new Map(); // nombre visible -> id, para el avatar del chip del modelo
	let cargando = false;
	let pendiente = false;

	// vuelve a acomodar el composer cuando llegan los datos
	const programar = () => mover();

	const agregarModelos = (lista, origen) => {
		// con nombres repetidos (persona y modelo crudo oculto) gana el visible; las personas guardadas mandan
		for (const m of lista) {
			const oculto = origen === 'personas' ? m.meta?.hidden : m.info?.meta?.hidden;
			if (origen === 'todos' && idPorNombre.has(m.name)) continue;
			if (!idPorNombre.has(m.name) || !oculto) idPorNombre.set(m.name, m.id);
		}
	};

	const razonamientoDe = (lista, origen) =>
		lista
			.filter((m) => {
				if (origen === 'todos' && (m.pipe || m.direct)) return false;
				const params = origen === 'personas' ? m.params : m.info?.params;
				return Object.keys(params?.model_controls ?? {}).length > 0;
			})
			.map((m) => {
				const params = origen === 'personas' ? m.params : m.info.params;
				return [m.name, { id: m.id, predeterminado: params.model_controls.razonamiento?.default }];
			});

	/*
	 * Carga rápida: /api/v1/models/list (modelos guardados en Espacio de Trabajo, como tus personas, con su
	 * nivel de razonamiento) responde en milisegundos; /api/models consulta a cada servidor de modelos y tarda
	 * segundos. Se usa primero la rápida para pintar el avatar y el chip de Razonamiento, y la completa se completa
	 * después en segundo plano (para los modelos que no son personas). Sin caché: siempre datos al día.
	 */
	const headers = () => ({ Authorization: `Bearer ${localStorage.token}` });

	// lista completa (lenta): solo si el modelo elegido no es una persona guardada, o si falla la rápida
	let todosPedidos = false;
	const cargarTodos = async () => {
		if (todosPedidos) return;
		todosPedidos = true;
		try {
			const { data } = await (await fetch('/api/models', { headers: headers() })).json();
			conRazonamiento ??= new Map();
			agregarModelos(data, 'todos');
			for (const [nombre, info] of razonamientoDe(data, 'todos')) {
				if (!conRazonamiento.has(nombre)) conRazonamiento.set(nombre, info);
			}
		} catch {
			conRazonamiento ??= new Map();
		}
		programar();
	};

	const cargar = async () => {
		const ajustes = fetch('/api/v1/users/user/settings', { headers: headers() })
			.then((r) => r.json())
			.then((j) => {
				elecciones = j?.ui?.params?.model_controls ?? {};
			})
			.catch(() => {});
		try {
			const r = await fetch('/api/v1/models/list', { headers: headers() });
			const j = r.ok ? await r.json() : null;
			const personas = (Array.isArray(j?.items) ? j.items : Array.isArray(j) ? j : []).filter(
				(m) => m.is_active !== false
			);
			if (!personas.length) throw new Error('sin lista rápida');
			idPorNombre = new Map();
			agregarModelos(personas, 'personas');
			conRazonamiento = new Map(razonamientoDe(personas, 'personas'));
			await ajustes;
			programar();
		} catch {
			await ajustes;
			cargarTodos();
		}
	};

	// Composer elegido: el chip del modelo lleva el avatar del modelo a la izquierda del nombre
	const avatarModelo = () => {
		const chip = skVisible(`${MODELO} > div`);
		const id = idPorNombre.get(chip?.textContent.trim());
		if (chip && !id && chip.textContent.trim()) cargarTodos();
		if (!chip || !id) return;
		let img = chip.querySelector(':scope > img.sk-modelo-avatar');
		if (img?.dataset.id === id) return;
		if (!img) {
			img = document.createElement('img');
			img.className = 'sk-modelo-avatar';
			img.alt = '';
			chip.prepend(img);
		}
		img.dataset.id = id;
		img.src = `/api/v1/models/model/profile/image?id=${encodeURIComponent(id)}`;
	};

	const mover = () => {
		pendiente = false;
		if (conRazonamiento) avatarModelo();
		if (!conRazonamiento) {
			// La lista se pide al primer composer con sesión iniciada (no en la pantalla de acceso)
			if (localStorage.token && !cargando) {
				cargando = true;
				cargar();
			}
			return;
		}
		const boton = skVisible(BOTON);
		const chips = skVisible(CHIPS);
		const envoltura = boton?.closest(`${DERECHA} > span, ${CHIPS} > span`);
		if (!envoltura || !chips) return;
		const modelo = conRazonamiento.get(skVisible(MODELO)?.textContent.trim());
		const razona = Boolean(modelo);
		const nivel = modelo && (elecciones[modelo.id]?.razonamiento ?? modelo.predeterminado);
		boton.classList.toggle('sk-razonamiento', razona);
		// "Apagado" cuenta como opción inactiva en el botón de opciones del teléfono
		boton.classList.toggle('sk-apagado', razona && nivel === 'apagado');
		if (razona && envoltura.parentElement !== chips) {
			envoltura.skOrigen = envoltura.parentElement;
			envoltura.skSiguiente = envoltura.nextSibling;
			chips.appendChild(envoltura);
		} else if (!razona && envoltura.parentElement === chips && envoltura.skOrigen?.isConnected) {
			const siguiente = envoltura.skSiguiente?.parentNode === envoltura.skOrigen ? envoltura.skSiguiente : null;
			envoltura.skOrigen.insertBefore(envoltura, siguiente);
		}
	};

	// Open WebUI guarda el nivel elegido con /users/user/settings/update; se lee de ahí sin volver a pedirlo
	const fetchOriginal = window.fetch;
	window.fetch = function (recurso, opciones) {
		try {
			const url = typeof recurso === 'string' ? recurso : (recurso?.url ?? '');
			if (url.includes('/users/user/settings/update') && typeof opciones?.body === 'string') {
				const controles = JSON.parse(opciones.body)?.ui?.params?.model_controls;
				if (controles) {
					elecciones = controles;
					requestAnimationFrame(mover);
				}
			}
		} catch {
			// cuerpo que no es JSON: no es un cambio de nivel
		}
		return fetchOriginal.apply(this, arguments);
	};

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(mover);
	}).observe(document.documentElement, {
		childList: true,
		subtree: true,
		// al cambiar de modelo Open WebUI a veces solo cambia el texto del nombre (sin agregar nodos)
		characterData: true
	});
})();

/*
 * Móvil (mockup L): botón "Herramientas y opciones" junto a Integraciones. Muestra cuántas opciones
 * hay y cuántas están activas ("3/4") y abre una hoja de vidrio con ellas (carbono.css convierte la fila de chips de Open WebUI
 * en esa hoja); tocar una fila es tocar el chip real. En escritorio el botón está oculto.
 */
(() => {
	const COMPOSER = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper'])";
	const CHIPS = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) > div[dir='ltr'] > div:nth-child(2)";
	const IZQUIERDA = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) > div[dir='ltr'] > div:first-child";
	const ICONO =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
	let pendiente = false;

	const cerrar = () => {
		const composer = skVisible(COMPOSER);
		composer?.classList.remove('sk-opciones-abiertas');
		skVisible('.sk-opciones-boton')?.setAttribute('aria-expanded', 'false');
		document.querySelector('.sk-opciones-velo')?.remove();
	};

	const abrir = (composer) => {
		composer.classList.add('sk-opciones-abiertas');
		skVisible('.sk-opciones-boton')?.setAttribute('aria-expanded', 'true');
		if (!document.querySelector('.sk-opciones-velo')) {
			const velo = document.createElement('div');
			velo.className = 'sk-opciones-velo';
			velo.addEventListener('click', cerrar);
			composer.parentElement.insertBefore(velo, composer);
		}
	};

	const actualizar = () => {
		pendiente = false;
		const composer = skVisible(COMPOSER);
		const izquierda = skVisible(IZQUIERDA);
		if (!composer || !izquierda) return;

		let boton = izquierda.querySelector('.sk-opciones-boton');
		if (!boton) {
			boton = document.createElement('button');
			boton.type = 'button';
			boton.className = 'sk-opciones-boton';
			boton.setAttribute('aria-expanded', 'false');
			boton.innerHTML = ICONO;
			boton.addEventListener('click', () => {
				const c = skVisible(COMPOSER);
				if (c.classList.contains('sk-opciones-abiertas')) cerrar();
				else abrir(c);
			});
			izquierda.appendChild(boton);
		}

		const chips = skVisible(CHIPS);
		const contenedor = chips?.querySelector(':scope > div');
		if (contenedor) sincronizarApagadas(contenedor);
		// Workspace no es un interruptor: no cuenta en el contador (en el teléfono va dentro del menú +)
		const opciones = chips ? [...chips.querySelectorAll("button:not([aria-label='Choose working directory']):not(:has(path[d^='M21.75 6.75']))")] : [];
		let activas = 0;
		for (const opcion of opciones) {
			const activa = estaActiva(opcion);
			if (activa) activas++;
			if (opcion.classList.contains('sk-inactiva') === activa) opcion.classList.toggle('sk-inactiva', !activa);
		}
		const total = String(opciones.length);
		if (boton.dataset.total !== total || boton.dataset.activas !== String(activas)) {
			boton.dataset.total = total;
			boton.dataset.activas = String(activas);
			boton.setAttribute('aria-label', `Herramientas y opciones: ${activas} de ${total} activas`);
			// contador en la esquina: activas en negrita y el total más chico ("3/4")
			let contador = boton.querySelector('.sk-contador');
			if (!contador) {
				contador = document.createElement('span');
				contador.className = 'sk-contador';
				contador.setAttribute('aria-hidden', 'true');
				boton.appendChild(contador);
			}
			contador.innerHTML = opciones.length ? `<b>${activas}</b><span>/${opciones.length}</span>` : '';
		}
		// Composer elegido: una insignia de color por opción activa, encimadas (en lugar del ícono de lista)
		const tipos = opciones.filter((o) => !o.classList.contains('sk-inactiva')).map(tipoDe).filter(Boolean);
		const firma = tipos.join(',');
		if (boton.dataset.insignias !== firma) {
			boton.dataset.insignias = firma;
			let insignias = boton.querySelector('.sk-insignias');
			if (!insignias) {
				insignias = document.createElement('span');
				insignias.className = 'sk-insignias';
				insignias.setAttribute('aria-hidden', 'true');
				boton.prepend(insignias);
			}
			insignias.innerHTML = tipos.map((tipo) => `<i class="sk-insignia-${tipo}"></i>`).join('');
		}
		const resumen = `${activas} de ${opciones.length} activas`;
		if (chips && chips.dataset.activas !== resumen) chips.dataset.activas = resumen;
	};

	/*
	 * Open WebUI quita el chip de Web al apagarla (y el de Herramientas si no hay ninguna elegida), así que
	 * desaparecían de la hoja. Se recuerda su ícono y, mientras falten, la hoja muestra una fila apagada
	 * (.sk-fantasma) que los vuelve a encender desde el menú de Integraciones (o el "+" desde 0.13.1).
	 */
	const APAGABLES = [
		{ clave: 'web', icono: 'M12 21a9.004', nombre: 'Búsqueda web', menu: 'Búsqueda Web', cerrarMenu: true },
		{ clave: 'imagen', icono: 'M21 7.6V20.4', nombre: 'Imagen', menu: 'Imagen', cerrarMenu: true }
	];
	let iconos = {};
	try {
		iconos = JSON.parse(localStorage.getItem('sk-opciones-iconos') || '{}');
	} catch {
		// sin sessionStorage: solo se recuerdan los íconos de esta página
	}

	const encender = async (apagable) => {
		// el menú + se abre solo para tocar la opción: se mantiene invisible mientras tanto
		document.documentElement.classList.add('sk-encendiendo');
		setTimeout(() => document.documentElement.classList.remove('sk-encendiendo'), 1800);
		// desde 0.13.1 Integraciones vive dentro del menú "+" (#input-menu-button)
		const integraciones = document.querySelector('#integration-menu-button') ?? skVisible('#input-menu-button');
		integraciones?.click();
		for (let intento = 0; intento < 30; intento++) {
			await new Promise((r) => setTimeout(r, 50));
			const item = [...document.querySelectorAll("[role='menu'] [role^='menuitem']")].find((e) =>
				// sin distinguir mayúsculas: el tema traduce "Búsqueda Web" a "Búsqueda web"
				e.textContent.trim().toLowerCase().startsWith(apagable.menu.toLowerCase())
			);
			if (item) {
				item.click();
				// Web se enciende y se cierra el menú; Herramientas deja abierto su submenú para elegir
				if (apagable.cerrarMenu) integraciones?.click();
				return;
			}
		}
	};

	const hijoDirecto = (contenedor, el) => {
		while (el && el.parentElement !== contenedor) el = el.parentElement;
		return el;
	};

	const sincronizarApagadas = (contenedor) => {
		let anterior = null; // el chip (real o apagado) tras el que va el siguiente, para conservar el orden
		for (const apagable of APAGABLES) {
			const real = [...contenedor.querySelectorAll('button:not(.sk-fantasma)')].find((b) =>
				b.querySelector(`path[d^='${apagable.icono}']`)
			);
			let fantasma = contenedor.querySelector(`.sk-fantasma[data-tipo='${apagable.clave}']`);
			if (real) {
				const svg = real.querySelector('svg')?.outerHTML;
				if (svg && iconos[apagable.clave] !== svg) {
					iconos[apagable.clave] = svg;
					try {
						localStorage.setItem('sk-opciones-iconos', JSON.stringify(iconos));
					} catch {
						// sin sessionStorage
					}
				}
				fantasma?.remove();
				anterior = hijoDirecto(contenedor, real);
				continue;
			}
			if (!iconos[apagable.clave]) {
				// el ícono también está en el menú +: se toma de ahí si el chip nunca se ha visto
				const enMenu = document.querySelector(`.sk-menu-mas svg:has(path[d^='${apagable.icono}'])`);
				if (enMenu) {
					iconos[apagable.clave] = enMenu.outerHTML;
					try {
						localStorage.setItem('sk-opciones-iconos', JSON.stringify(iconos));
					} catch {
						// sin localStorage
					}
				}
			}
			if (!iconos[apagable.clave]) continue;
			if (!fantasma) {
				fantasma = document.createElement('button');
				fantasma.type = 'button';
				fantasma.className = 'sk-fantasma sk-inactiva';
				fantasma.dataset.tipo = apagable.clave;
				fantasma.setAttribute('aria-label', `${apagable.nombre} (apagada)`);
				fantasma.innerHTML = iconos[apagable.clave];
				fantasma.dataset.creado = String(Date.now());
				fantasma.addEventListener('click', () => {
					// el mismo clic que apagó la opción cae en el chip gris que aparece en su lugar: se ignora
					if (Date.now() - Number(fantasma.dataset.creado) < 600) return;
					encender(apagable);
				});
				contenedor.insertBefore(fantasma, anterior ? anterior.nextSibling : contenedor.firstChild);
			}
			anterior = fantasma;
		}
	};

	const tipoDe = (opcion) => {
		if (opcion.dataset.tipo) return opcion.dataset.tipo;
		if (opcion.classList.contains('sk-razonamiento')) return 'razonamiento';
		if (opcion.querySelector("path[d^='M21.75 6.75']")) return 'herramientas';
		if (opcion.querySelector("path[d^='M12 21a9.004']")) return 'web';
		if (opcion.querySelector("path[d^='M12 4C6 4 6 8']")) return 'terminal';
		if (opcion.querySelector("path[d^='M21 7.6V20.4']")) return 'imagen';
		return null;
	};

	// Herramientas con al menos una elegida, Web encendida, terminal elegida y razonamiento distinto de Apagado
	const estaActiva = (opcion) => {
		if (opcion.classList.contains('sk-fantasma')) return false;
		if (opcion.classList.contains('sk-razonamiento')) return !opcion.classList.contains('sk-apagado');
		if (opcion.hasAttribute('aria-pressed')) return opcion.getAttribute('aria-pressed') === 'true';
		if (opcion.querySelector("path[d^='M21.75 6.75']")) return /[1-9]/.test(opcion.textContent);
		if (opcion.querySelector("path[d^='M12 4C6 4 6 8']")) return !opcion.classList.contains('opacity-50');
		return true;
	};

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') cerrar();
	});

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}).observe(document.documentElement, {
		childList: true,
		subtree: true,
		// encender o apagar una opción solo cambia aria-pressed o la clase del chip
		attributes: true,
		attributeFilter: ['aria-pressed', 'class']
	});
})();

/*
 * Modo de alto contraste de Open WebUI (Ajustes › Interfaz): oscurece los grises, subraya el chat
 * abierto y dibuja un contorno dentro del cuadro de texto, y choca con la paleta del tema. Mientras el
 * tema está activo se le quita la clase high-contrast a <html>; al quitar el tema vuelve a funcionar.
 */
(() => {
	const html = document.documentElement;
	const quitar = () => {
		if (html.classList.contains('high-contrast')) html.classList.remove('high-contrast');
	};
	quitar();
	new MutationObserver(quitar).observe(html, { attributes: true, attributeFilter: ['class'] });
})();

/*
 * Barra lateral contraída (lienzo "Escritorio · Barra lateral contraída con chats"): botón "Chats" bajo
 * Espacio de Trabajo que abre un panel de vidrio con carpetas, fijados y el historial por fecha, sin
 * abrir la barra lateral. Los datos salen de la API de Open WebUI con la sesión del usuario.
 */
(() => {
	const RAIL = '#sidebar:has(#sidebar-open-button)';
	const ICONO_CHATS =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h11a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9l-4 3v-3H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/><path d="M17 9h3a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-1v3l-4-3h-3"/></svg>';
	const ICONOS = {
		nuevo: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/>',
		barra: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
		cerrar: '<path d="M6 6l12 12M18 6L6 18"/>',
		buscar: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
		mas: '<path d="M12 5v14M5 12h14"/>',
		fijado: '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>',
		carpeta: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
		flecha: '<path d="M9 6l6 6-6 6"/>'
	};
	const svg = (nombre, tam = 19) =>
		`<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`;
	const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	const esc = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);

	let datos = null; // { fijados, recientes, carpetas }
	const chatsDeCarpeta = new Map(); // id de carpeta -> chats (al abrirla)
	const abiertas = new Set();
	let filtro = '';
	let creandoCarpeta = false;
	let pendiente = false;
	let modelosFijados = null; // [{ id, nombre }] de la sección Modelos de la barra lateral

	const pedir = async (url) => {
		const r = await fetch(url, { headers: { Authorization: `Bearer ${localStorage.token}` } });
		return r.ok ? r.json() : [];
	};

	const cargar = async () => {
		const [fijados, carpetas] = await Promise.all([pedir('/api/v1/chats/pinned'), pedir('/api/v1/folders/')]);
		// como la barra lateral: sin fijados ni chats de carpetas; hasta 5 páginas de 60
		const recientes = [];
		for (let pagina = 1; pagina <= 5; pagina++) {
			const lote = await pedir(`/api/v1/chats/list?page=${pagina}`);
			recientes.push(...lote);
			if (lote.length < 60) break;
		}
		datos = { fijados, recientes, carpetas };
	};

	const hace = (segundos) => {
		const s = Math.max(0, Date.now() / 1000 - segundos);
		if (s < 3600) return `hace ${Math.max(1, Math.floor(s / 60))} min`;
		if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
		if (s < 7 * 86400) return `hace ${Math.floor(s / 86400)} d`;
		if (s < 30 * 86400) return `hace ${Math.floor(s / (7 * 86400))} sem`;
		if (s < 365 * 86400) return `hace ${Math.floor(s / (30 * 86400))} mes`;
		return `hace ${Math.floor(s / (365 * 86400))} a`;
	};

	const grupo = (segundos) => {
		const hoy = new Date();
		hoy.setHours(0, 0, 0, 0);
		const fecha = new Date(segundos * 1000);
		const dias = Math.round((hoy - new Date(fecha).setHours(0, 0, 0, 0)) / 86400000);
		if (dias <= 0) return 'Hoy';
		if (dias === 1) return 'Ayer';
		if (dias < 7) return '7 días previos';
		if (dias < 30) return '30 días previos';
		const mes = fecha.toLocaleDateString('es', { month: 'long' });
		const nombre = mes.charAt(0).toUpperCase() + mes.slice(1);
		return fecha.getFullYear() === hoy.getFullYear() ? nombre : `${nombre} ${fecha.getFullYear()}`;
	};

	const fila = (chat) => {
		const actual = location.pathname === `/c/${chat.id}`;
		return `<a class="sk-chats-fila${actual ? ' sk-chats-actual' : ''}" href="/c/${esc(chat.id)}"${actual ? ' aria-current="page"' : ''}><span class="sk-chats-titulo">${esc(chat.title)}</span><span class="sk-chats-hace">${hace(chat.updated_at)}</span></a>`;
	};

	const coincide = (chat) => !filtro || String(chat.title).toLowerCase().includes(filtro);

	const pintarLista = () => {
		const lista = document.querySelector('.sk-chats-lista');
		if (!lista) return;
		if (!datos) {
			lista.innerHTML = '<p class="sk-chats-vacio">Cargando…</p>';
			return;
		}
		let html = '';
		if (!filtro) {
			html += `<div class="sk-chats-seccion"><div class="sk-chats-etiqueta sk-chats-etiqueta-accion"><span>Carpetas</span><button type="button" class="sk-chats-accion sk-chats-mini" data-accion="nueva-carpeta" aria-label="Nueva carpeta" title="Nueva carpeta">${svg('mas', 16)}</button></div>`;
			if (creandoCarpeta) {
				html += `<label class="sk-chats-carpeta sk-chats-nueva">${svg('carpeta', 17)}<input type="text" placeholder="Nombre de la carpeta" aria-label="Nombre de la carpeta" maxlength="80"></label>`;
			}
			for (const carpeta of datos.carpetas) {
				const abierta = abiertas.has(carpeta.id);
				html += `<button type="button" class="sk-chats-carpeta" data-carpeta="${esc(carpeta.id)}" aria-expanded="${abierta}">${svg('flecha', 14)}${svg('carpeta', 17)}<span class="sk-chats-titulo">${esc(carpeta.name)}</span></button>`;
				if (abierta) {
					const chats = chatsDeCarpeta.get(carpeta.id);
					const contenido = !chats
						? '<p class="sk-chats-vacio">Cargando…</p>'
						: chats.length
							? chats.map(fila).join('')
							: '<p class="sk-chats-vacio">Sin chats</p>';
					html += `<div class="sk-chats-dentro">${contenido}</div>`;
				}
			}
			html += '</div>';
		}
		const fijados = datos.fijados.filter(coincide);
		if (fijados.length) {
			html += `<div class="sk-chats-seccion"><div class="sk-chats-etiqueta">${svg('fijado', 14)}Fijado</div>${fijados.map(fila).join('')}</div>`;
		}
		let actual = null;
		for (const chat of datos.recientes.filter(coincide)) {
			const nombre = grupo(chat.updated_at);
			if (nombre !== actual) {
				if (actual) html += '</div>';
				html += `<div class="sk-chats-seccion"><div class="sk-chats-etiqueta">${esc(nombre)}</div>`;
				actual = nombre;
			}
			html += fila(chat);
		}
		if (actual) html += '</div>';
		lista.innerHTML = html || `<p class="sk-chats-vacio">${filtro ? 'Ningún chat coincide' : 'Aún no hay chats'}</p>`;
		const nombre = lista.querySelector('.sk-chats-nueva input');
		if (nombre) {
			nombre.focus();
			nombre.addEventListener('keydown', async (e) => {
				e.stopPropagation(); // Esc cancela la carpeta, no cierra el panel
				if (e.key === 'Escape') {
					creandoCarpeta = false;
					pintarLista();
				}
				if (e.key === 'Enter' && nombre.value.trim()) {
					await fetch('/api/v1/folders/', {
						method: 'POST',
						headers: { Authorization: `Bearer ${localStorage.token}`, 'Content-Type': 'application/json' },
						body: JSON.stringify({ name: nombre.value.trim() })
					});
					creandoCarpeta = false;
					datos.carpetas = await pedir('/api/v1/folders/');
					pintarLista();
				}
			});
		}
	};

	const cerrar = () => {
		document.querySelector('.sk-chats-panel')?.remove();
		document.querySelector('.sk-chats-velo')?.remove();
		document.querySelector('.sk-chats-boton')?.setAttribute('aria-expanded', 'false');
	};

	const abrir = () => {
		const rail = document.querySelector(RAIL);
		if (!rail) return;
		filtro = '';
		const velo = document.createElement('div');
		velo.className = 'sk-chats-velo';
		velo.addEventListener('click', cerrar);
		const panel = document.createElement('aside');
		panel.className = 'sk-chats-panel';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', 'Chats');
		panel.style.left = `${rail.getBoundingClientRect().right + 8}px`;
		panel.innerHTML = `
			<div class="sk-chats-cabecera">
				<span class="sk-chats-nombre">Chats</span>
				<div class="sk-chats-acciones">
					<a class="sk-chats-accion" href="/" aria-label="Nuevo chat" title="Nuevo chat">${svg('nuevo')}</a>
					<button type="button" class="sk-chats-accion" data-accion="barra" aria-label="Mantener barra abierta" title="Mantener barra abierta">${svg('barra')}</button>
					<button type="button" class="sk-chats-accion" data-accion="cerrar" aria-label="Cerrar" title="Cerrar">${svg('cerrar')}</button>
				</div>
			</div>
			<label class="sk-chats-buscar">${svg('buscar', 18)}<input type="search" placeholder="Buscar chats" aria-label="Buscar chats"></label>
			<div class="sk-chats-lista"></div>`;
		panel.addEventListener('click', async (e) => {
			const accion = e.target.closest('[data-accion]')?.dataset.accion;
			if (accion === 'cerrar') cerrar();
			if (accion === 'nueva-carpeta') {
				creandoCarpeta = !creandoCarpeta;
				pintarLista();
				return;
			}
			if (accion === 'barra') {
				cerrar();
				document.querySelector('#sidebar-open-button')?.click();
			}
			if (e.target.closest('a')) cerrar(); // Open WebUI navega sin recargar
			const carpeta = e.target.closest('[data-carpeta]')?.dataset.carpeta;
			if (carpeta) {
				if (abiertas.has(carpeta)) abiertas.delete(carpeta);
				else {
					abiertas.add(carpeta);
					if (!chatsDeCarpeta.has(carpeta)) {
						pintarLista();
						chatsDeCarpeta.set(carpeta, await pedir(`/api/v1/chats/folder/${encodeURIComponent(carpeta)}/list?page=1`));
					}
				}
				pintarLista();
			}
		});
		panel.querySelector('input').addEventListener('input', (e) => {
			filtro = e.target.value.trim().toLowerCase();
			pintarLista();
		});
		document.body.append(velo, panel);
		document.querySelector('.sk-chats-boton')?.setAttribute('aria-expanded', 'true');
		pintarLista();
		// siempre datos frescos al abrir (chats nuevos, renombrados, fijados)
		cargar().then(pintarLista, () => {
			datos = { fijados: [], recientes: [], carpetas: [] };
			pintarLista();
		});
		panel.querySelector('input').focus();
	};

	// Modelos fijados (sección Modelos de la barra lateral): Ajustes del usuario, sin los ocultos
	const cargarModelos = async () => {
		modelosFijados = [];
		try {
			// lista rápida (personas guardadas, milisegundos): se pintan ya; la completa (/api/models, segundos) se pide
			// después solo si algún modelo fijado no es persona, y entonces se vuelven a pintar los avatares
			const [ajustes, rapida] = await Promise.all([
				pedir('/api/v1/users/user/settings'),
				pedir('/api/v1/models/list').catch(() => null)
			]);
			const ids = ajustes?.ui?.pinnedModels ?? [];
			const personas = (rapida?.items ?? []).filter((m) => m.is_active !== false && !m.meta?.hidden);
			const encontrados = ids.map((id) => personas.find((m) => m.id === id));
			modelosFijados = encontrados.filter(Boolean).map((m) => ({ id: m.id, nombre: m.name }));
			if (encontrados.some((m) => !m)) {
				pedir('/api/models')
					.then(({ data = [] } = {}) => {
						const completos = ids
							.map((id, i) => encontrados[i] ?? data.find((m) => m.id === id && !m.info?.meta?.hidden))
							.filter(Boolean)
							.map((m) => ({ id: m.id, nombre: m.name }));
						if (completos.length === modelosFijados.length) return;
						modelosFijados = completos;
						document.querySelector('.sk-chats-envoltura')?.remove();
						asegurarBoton();
					})
					.catch(() => {});
			}
		} catch {
			// sin modelos fijados en la barra contraída
		}
		document.querySelector('.sk-chats-envoltura')?.remove(); // se vuelve a armar con los avatares
		asegurarBoton();
	};

	const asegurarBoton = () => {
		pendiente = false;
		const rail = document.querySelector(RAIL);
		if (!rail) {
			cerrar(); // la barra se abrió o cambió a teléfono
			return;
		}
		if (rail.querySelector('.sk-chats-boton')) return;
		if (!modelosFijados) {
			if (localStorage.token && modelosFijados === null) {
				modelosFijados = undefined;
				cargarModelos();
			}
			return;
		}
		const ultimo = rail.querySelector("a[href='/workspace']")?.closest('.flex')?.parentElement;
		if (!ultimo?.parentElement) return;
		const envoltura = document.createElement('div');
		envoltura.className = 'sk-chats-envoltura';
		const avatares = modelosFijados
			.map(
				(m) =>
					`<a class="sk-rail-modelo" href="/?model=${encodeURIComponent(m.id)}" aria-label="Nuevo chat con ${esc(m.nombre)}" title="${esc(m.nombre)}"><img src="/api/v1/models/model/profile/image?id=${encodeURIComponent(m.id)}" alt=""></a>`
			)
			.join('');
		envoltura.innerHTML = `${avatares ? `<span class="sk-chats-division" aria-hidden="true"></span>${avatares}` : ''}<span class="sk-chats-division" aria-hidden="true"></span><button type="button" class="sk-chats-boton" aria-label="Chats" aria-expanded="false" title="Chats">${ICONO_CHATS}</button><span class="sk-chats-leyenda" aria-hidden="true">Chats</span>`;
		// la barra contraída se abre con cualquier clic: se detiene aquí y se navega con un enlace suelto en
		// <body>, para que Open WebUI lo maneje sin recargar la página
		envoltura.querySelectorAll('.sk-rail-modelo').forEach((enlace) =>
			enlace.addEventListener('click', (e) => {
				e.preventDefault();
				e.stopPropagation();
				const suelto = document.createElement('a');
				suelto.href = enlace.getAttribute('href');
				suelto.hidden = true;
				document.body.appendChild(suelto);
				suelto.click();
				suelto.remove();
			})
		);
		envoltura.querySelector('button').addEventListener('click', (e) => {
			e.stopPropagation(); // la barra contraída se abre al tocar cualquier parte vacía
			if (document.querySelector('.sk-chats-panel')) cerrar();
			else abrir();
		});
		ultimo.after(envoltura);
	};

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && document.querySelector('.sk-chats-panel')) cerrar();
	});

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(asegurarBoton);
	}).observe(document.documentElement, { childList: true, subtree: true });
})();

/* Textos del selector de carpeta y del menú "+" (lienzos "Composer · Dirección de trabajo" y "Menú +"):
   Open WebUI 0.13.2 los deja en inglés o muy cortos. Solo se cambia el texto, sin tocar la estructura. */
(() => {
	const TEXTOS = {
		'No folder': 'Sin carpeta',
		'Open folder': 'Abrir carpeta…',
		'Add Context': 'Añadir contexto',
		'Subir Archivos': 'Subir archivos',
		Captura: 'Captura de pantalla',
		'Búsqueda Web': 'Búsqueda web',
		'Permisos de Herramientas': 'Permisos de Open Terminal'
	};
	const SUBTITULOS = {
		'Sin carpeta': 'El chat no usa ninguna carpeta',
		'Añadir contexto': 'Notas, chats o conocimiento'
	};
	let pendiente = false;

	const traducir = () => {
		pendiente = false;
		document.querySelectorAll('.app-dropdown-menu').forEach((menu) => {
			const esCarpeta = menu.querySelector("input[placeholder='Buscar carpetas']");
			const esMas = menu.querySelector("path[d^='M21.4383 11.6622']");
			const esHerramientas = menu.querySelector("input[placeholder='Buscar herramientas']");
			if (!esCarpeta && !esMas && !esHerramientas) return;
			menu.classList.toggle('sk-menu-herramientas', !!esHerramientas);
			menu.classList.toggle('sk-menu-carpeta', !!esCarpeta);
			menu.classList.toggle('sk-menu-mas', !!esMas);
			// el menú "+" quedó más alto que lo que Open WebUI calculó: se ancla desde abajo, justo arriba de la
			// caja del mensaje (la CSS usa --sk-mas-abajo con !important porque Open WebUI reescribe su posición)
			const caja = skVisible(":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper'])");
			if ((esMas || esCarpeta || esHerramientas) && caja) {
				const abajo = Math.max(12, window.innerHeight - caja.getBoundingClientRect().top + 8);
				document.documentElement.style.setProperty('--sk-mas-abajo', `${abajo}px`);
			}
			menu.querySelectorAll('button span, button div').forEach((el) => {
				if (el.children.length || el.closest('.sk-menu-workspace')) return;
				const texto = el.textContent.trim();
				const nuevo = TEXTOS[texto];
				if (nuevo) el.textContent = nuevo;
				const ambitos = texto.match(/^Ámbitos seleccionados: (\d+)$/);
				if (ambitos) el.textContent = `${ambitos[1]} ${ambitos[1] === '1' ? 'seleccionada' : 'seleccionadas'}`;
				const sub = SUBTITULOS[el.textContent.trim()];
				if (sub && !el.dataset.skSub) {
					el.dataset.skSub = sub;
					el.classList.add('sk-con-subtitulo');
				}
			});
		});
	};

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(traducir);
	}).observe(document.documentElement, { childList: true, subtree: true });
})();

/* Al achicar la ventana de escritorio a teléfono con la vista dividida abierta, Open WebUI pasa el otro
   lado a un cajón "Pestañas" encima del chat. Aquí se cierra solo ese cajón automático (con su propio
   botón "Ocultar pestañas"), para que quede el chat; abrirlo a mano en el teléfono sigue funcionando. */
(() => {
	const telefono = window.matchMedia('(max-width: 767px)');
	telefono.addEventListener('change', (e) => {
		if (!e.matches) return;
		const hasta = Date.now() + 2000;
		const cerrar = () => {
			const boton = document.querySelector(
				".modal[role='dialog'][aria-label='Pestañas'] button[aria-label='Ocultar pestañas'], .modal[role='dialog'][aria-label='Tabs'] button[aria-label='Hide tabs']"
			);
			if (boton) boton.click();
			else if (Date.now() < hasta) setTimeout(cerrar, 100);
		};
		setTimeout(cerrar, 50);
	});
})();

/* Menú + en el teléfono: fila "Workspace" (insignia turquesa, nombre de la carpeta o "Sin carpeta" y flecha)
   en el grupo Herramientas. Abre el mismo selector de carpeta de Open WebUI. */
(() => {
	const telefono = window.matchMedia('(max-width: 767px)');
	const CARPETA = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) button[aria-label='Choose working directory']";
	const SVG_CARPETA =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>';
	const SVG_FLECHA =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>';
	let pendiente = false;

	const asegurar = () => {
		pendiente = false;
		const menu = document.querySelector('.app-dropdown-menu.sk-menu-mas');
		if (!menu) return;
		const carpeta = skVisible(CARPETA);
		let fila = menu.querySelector('.sk-menu-workspace');
		if (!telefono.matches || !carpeta) {
			fila?.remove();
			return;
		}
		const nombre = carpeta.querySelector('span')?.textContent.trim() || '';
		if (!fila) {
			const herramientas = menu.querySelector("button:has(path[d^='M21.75 6.75'])");
			const grupo = herramientas?.parentElement;
			if (!grupo) return;
			fila = document.createElement('button');
			fila.type = 'button';
			fila.setAttribute('role', 'menuitem');
			fila.className = 'sk-menu-workspace';
			fila.innerHTML = `${SVG_CARPETA}<div class="justify-between"><div>Workspace</div><div><div class="sk-workspace-sub"></div>${SVG_FLECHA}</div></div>`;
			fila.addEventListener('click', (e) => {
				e.stopPropagation();
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				setTimeout(() => skVisible(CARPETA)?.click(), 120);
			});
			grupo.appendChild(fila);
		}
		const sub = fila.querySelector('.sk-workspace-sub');
		const texto = nombre || 'Sin carpeta';
		if (sub && sub.textContent !== texto) sub.textContent = texto;
		const etiqueta = `Workspace: ${texto}`;
		if (fila.getAttribute('aria-label') !== etiqueta) fila.setAttribute('aria-label', etiqueta);
	};

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(asegurar);
	}).observe(document.documentElement, { childList: true, subtree: true });
})();

/* Archivos que el lanzador sirve parchados (p. ej. el chat lateral con Open Terminal y Workspace): el navegador
   pudo guardar la versión original. Se refrescan una vez en su caché y, si ya estaban cargados en esta página,
   se recarga una sola vez para usar la versión nueva. */
(async () => {
	try {
		const r = await fetch('/static/carbono-parches.json', { cache: 'no-store' });
		if (!r.ok) return;
		const { recargar = [] } = await r.json();
		let hechos = [];
		try {
			hechos = JSON.parse(localStorage.getItem('sk-parches') || '[]');
		} catch {
			// sin localStorage: se intenta en cada carga, sin recargar la página
		}
		const pendientes = recargar.filter((ruta) => !hechos.includes(ruta));
		if (!pendientes.length) return;
		await Promise.all(pendientes.map((ruta) => fetch(ruta, { cache: 'reload' })));
		try {
			localStorage.setItem('sk-parches', JSON.stringify([...hechos, ...pendientes]));
		} catch {
			return;
		}
		const yaCargado = pendientes.some((ruta) =>
			performance.getEntriesByType('resource').some((e) => e.name.endsWith(ruta))
		);
		if (yaCargado) location.reload();
	} catch {
		// sin el lanzador del tema (o sin red): nada que refrescar
	}
})();

/* Menú de Razonamiento (Controles del modelo): en lugar del deslizador con puntitos, un control segmentado con
   los niveles (Apagado · Bajo · Medio · Alto · Adaptable). Cada botón mueve el deslizador original de Open WebUI
   (se conserva oculto), así que se guarda igual que antes. */
(() => {
	const NIVELES_5 = ['Apagado', 'Bajo', 'Medio', 'Alto', 'Adaptable'];
	let pendiente = false;

	const mover = (rango, valor) => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
		setter.call(rango, String(valor));
		rango.dispatchEvent(new Event('input', { bubbles: true }));
		rango.dispatchEvent(new Event('change', { bubbles: true }));
	};

	const asegurar = () => {
		pendiente = false;
		document.querySelectorAll('.app-dropdown-menu').forEach((menu) => {
			const rango = menu.querySelector("input[type='range'][aria-label='Razonamiento']");
			if (!rango) return;
			menu.classList.add('sk-menu-razonamiento');
			const caja = skVisible(":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper'])");
			if (caja) {
				const abajo = Math.max(12, window.innerHeight - caja.getBoundingClientRect().top + 8);
				document.documentElement.style.setProperty('--sk-mas-abajo', `${abajo}px`);
			}
			const max = Number(rango.max);
			// solo con los cinco niveles conocidos; con otra escala se deja el deslizador
			if (max !== NIVELES_5.length - 1) return;
			const bloque = rango.closest('.space-y-1');
			if (!bloque) return;
			bloque.classList.add('sk-razonamiento-original');
			let niveles = menu.querySelector('.sk-niveles');
			if (!niveles) {
				niveles = document.createElement('div');
				niveles.className = 'sk-niveles';
				niveles.setAttribute('role', 'radiogroup');
				niveles.setAttribute('aria-label', 'Nivel de razonamiento');
				NIVELES_5.forEach((nombre, i) => {
					const b = document.createElement('button');
					b.type = 'button';
					b.setAttribute('role', 'radio');
					b.textContent = nombre;
					b.addEventListener('click', (e) => {
						e.stopPropagation();
						const r = menu.querySelector("input[type='range'][aria-label='Razonamiento']");
						if (r) mover(r, i);
					});
					niveles.appendChild(b);
				});
				bloque.after(niveles);
			}
			const actual = Number(rango.value);
			niveles.querySelectorAll('button').forEach((b, i) => {
				const marcado = i === actual ? 'true' : 'false';
				if (b.getAttribute('aria-checked') !== marcado) b.setAttribute('aria-checked', marcado);
			});
		});
	};

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(asegurar);
	}).observe(document.documentElement, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['aria-valuetext']
	});
})();

/* Visor de imágenes: un toque o clic fuera de la imagen (en el fondo oscuro) lo cierra. Se cierra al soltar
   (pointerup) porque en el teléfono el visor se queda con los toques y el "click" no llega; luego se descarta el
   clic que sigue para que no caiga en el chat de atrás. No cierra si se arrastró o amplió la imagen (el puntero se
   movió o hubo dos dedos) ni al tocar los botones. */
(() => {
	let inicio = null;
	let dedos = 0;
	const visor = (e) => e.target.closest?.(".modal[role='dialog'][aria-modal='true'].bg-black");

	document.addEventListener(
		'pointerdown',
		(e) => {
			const modal = visor(e);
			if (!modal) {
				inicio = null;
				return;
			}
			dedos = e.isPrimary ? 1 : dedos + 1;
			inicio = { x: e.clientX, y: e.clientY };
		},
		true
	);

	document.addEventListener(
		'pointerup',
		(e) => {
			const modal = visor(e);
			const datos = inicio;
			inicio = null;
			if (!modal || !datos || dedos > 1) return;
			if (Math.hypot(e.clientX - datos.x, e.clientY - datos.y) > 8) return;
			if (e.target.closest('button')) return;
			const img = modal.querySelector('img');
			if (img) {
				// la caja de la imagen puede llenar la pantalla (object-fit: scale-down/contain): se mide lo dibujado
				const r = img.getBoundingClientRect();
				let { left, top, width, height } = r;
				if (img.naturalWidth && img.naturalHeight) {
					const ajuste = getComputedStyle(img).objectFit;
					if (ajuste === 'contain' || ajuste === 'scale-down') {
						let escala = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
						if (ajuste === 'scale-down') escala = Math.min(escala, 1);
						width = img.naturalWidth * escala;
						height = img.naturalHeight * escala;
						left = r.left + (r.width - width) / 2;
						top = r.top + (r.height - height) / 2;
					}
				}
				if (e.clientX >= left && e.clientX <= left + width && e.clientY >= top && e.clientY <= top + height) return;
			}
			const cerrar = modal.querySelector(':scope > div:first-child button');
			if (!cerrar) return;
			const tragar = (ev) => {
				ev.preventDefault();
				ev.stopPropagation();
			};
			cerrar.click();
			document.addEventListener('click', tragar, { capture: true, once: true });
			setTimeout(() => document.removeEventListener('click', tragar, true), 500);
		},
		true
	);
})();

/* ---------- Imagen: interruptor y tamaños (lienzo "Composer · Imagen") ----------
   El chip de Imagen siempre está a la vista (rojo encendido, contorno gris apagado). Tocarlo abre un panel de vidrio
   con el interruptor de generar imágenes y el tamaño de la imagen (ajuste IMAGE_SIZE de Open WebUI, solo
   administradores; si no se puede leer, el panel muestra solo el interruptor). */
(() => {
	const COMPOSER = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper'])";
	const ICONO = "path[d^='M21 7.6V20.4']";
	const TAMANOS = [
		{ valor: '1024x1024', nombre: 'Cuadrada', nota: 'Predeterminada · la más equilibrada · 1 MP', ritmo: 'Rápida', clase: 'rapida', w: 22, h: 22 },
		{ valor: '768x1344', nombre: 'Vertical alta (4:7)', nota: 'Móvil e historias, misma calidad y velocidad · 1 MP', ritmo: 'Rápida', clase: 'rapida', w: 13, h: 22 },
		{ valor: '1344x768', nombre: 'Horizontal ancha (7:4)', nota: 'Fondos y paisajes, misma velocidad · 1 MP', ritmo: 'Rápida', clase: 'rapida', w: 22, h: 13 },
		{ valor: '1216x1664', nombre: 'Retrato (≈3:4)', nota: 'Más detalle, más cálculo · 2 MP', ritmo: 'Lenta', clase: 'lenta', w: 16, h: 22 },
		{ valor: '1664x1216', nombre: 'Horizontal (≈4:3)', nota: 'Más detalle, más cálculo · 2 MP', ritmo: 'Lenta', clase: 'lenta', w: 22, h: 16 },
		{ valor: '1920x1080', nombre: 'Pantalla completa (16:9)', nota: 'Tamaño exacto; el más pesado · 2,1 MP', ritmo: 'Muy lenta', clase: 'muy-lenta', w: 22, h: 12 }
	];
	const headers = () => ({ Authorization: `Bearer ${localStorage.token}`, 'Content-Type': 'application/json' });
	let configuracion = null;
	let permitirClic = false;

	const chipReal = () =>
		[...document.querySelectorAll(`${COMPOSER} button[aria-pressed]`)].find(
			(b) => b.querySelector(ICONO) && b.getClientRects().length
		);
	const chipGris = () =>
		[...document.querySelectorAll(`${COMPOSER} .sk-fantasma[data-tipo='imagen']`)].find((b) => b.getClientRects().length);
	const encendida = () => Boolean(chipReal());

	const cerrar = () => {
		document.querySelector('.sk-imagen-panel')?.remove();
		document.querySelectorAll('.sk-imagen-abierto').forEach((b) => b.classList.remove('sk-imagen-abierto'));
	};

	const alternar = async () => {
		const real = chipReal();
		if (real) {
			permitirClic = true;
			real.click();
			permitirClic = false;
		} else {
			// encender: el menú + se abre invisible y se toca su opción Imagen (aunque esté oculta)
			document.documentElement.classList.add('sk-encendiendo');
			const mas = [...document.querySelectorAll('#input-menu-button')].find((b) => b.getClientRects().length);
			mas?.click();
			for (let i = 0; i < 30; i++) {
				await new Promise((r) => setTimeout(r, 50));
				const item = [...document.querySelectorAll("[role='menu'] [role='menuitemcheckbox']")].find((e) =>
					e.querySelector(ICONO)
				);
				if (item) {
					item.click();
					mas?.click();
					break;
				}
			}
			setTimeout(() => document.documentElement.classList.remove('sk-encendiendo'), 300);
		}
		setTimeout(pintar, 250);
	};

	const guardarTamano = async (valor) => {
		if (!configuracion) return;
		const anterior = configuracion.IMAGE_SIZE;
		configuracion.IMAGE_SIZE = valor;
		pintar();
		try {
			const r = await fetch('/api/v1/images/config/update', {
				method: 'POST',
				headers: headers(),
				body: JSON.stringify(configuracion)
			});
			if (!r.ok) throw new Error(String(r.status));
		} catch {
			configuracion.IMAGE_SIZE = anterior;
			pintar();
		}
	};

	const pintar = () => {
		const panel = document.querySelector('.sk-imagen-panel');
		if (!panel) return;
		const on = encendida();
		const sw = panel.querySelector('.sk-imagen-switch');
		sw.setAttribute('aria-checked', on ? 'true' : 'false');
		const modelo = configuracion?.IMAGE_GENERATION_MODEL || '';
		const nombreModelo = /z[_-]?image/i.test(modelo) ? 'Z-Image-Turbo' : /flux/i.test(modelo) ? 'FLUX' : modelo.replace(/\.(safetensors|gguf)$/i, '') || 'Imágenes';
		panel.querySelector('.sk-imagen-sub').textContent = `${nombreModelo} · se usa cuando le pidas una imagen`;
		panel.querySelectorAll('[role="menuitemradio"]').forEach((fila) => {
			fila.setAttribute('aria-checked', fila.dataset.valor === configuracion?.IMAGE_SIZE ? 'true' : 'false');
		});
	};

	const abrir = async (chip) => {
		cerrar();
		chip.classList.add('sk-imagen-abierto');
		const panel = document.createElement('div');
		panel.className = 'sk-imagen-panel';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', 'Imagen');
		panel.innerHTML = `
			<div class="sk-imagen-cabeza">
				<span class="sk-imagen-insignia">${chip.querySelector('svg')?.outerHTML ?? ''}</span>
				<span class="sk-imagen-textos"><b>Generar imagen</b><span class="sk-imagen-sub"></span></span>
				<button type="button" class="sk-imagen-switch" role="switch" aria-label="Generación de imágenes"><span></span></button>
			</div>
			<div class="sk-imagen-tamanos" hidden>
				<div class="sk-imagen-rotulo">Tamaño</div>
				${TAMANOS.map(
					(t) => `<button type="button" role="menuitemradio" data-valor="${t.valor}">
						<span class="sk-imagen-forma"><i style="width:${t.w}px;height:${t.h}px"></i></span>
						<span class="sk-imagen-fila"><span><b>${t.valor.replace('x', '×')}</b><em>${t.nombre}</em></span><small>${t.nota}</small></span>
						<span class="sk-imagen-ritmo sk-${t.clase}">${t.ritmo}</span>
						<svg class="sk-imagen-palomita" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12l5 5 9-10"/></svg>
					</button>`
				).join('')}
			</div>`;
		document.body.appendChild(panel);
		const caja = chip.closest(COMPOSER);
		const r = caja?.getBoundingClientRect();
		const c = chip.getBoundingClientRect();
		if (r) {
			panel.style.bottom = `${Math.max(12, window.innerHeight - r.top + 8)}px`;
			if (window.innerWidth >= 768) panel.style.left = `${Math.max(12, Math.min(c.left - 8, window.innerWidth - 452))}px`;
		}
		panel.querySelector('.sk-imagen-switch').addEventListener('click', alternar);
		panel.querySelectorAll('[role="menuitemradio"]').forEach((b) =>
			b.addEventListener('click', () => guardarTamano(b.dataset.valor))
		);
		pintar();
		try {
			const res = await fetch('/api/v1/images/config', { headers: headers() });
			if (res.ok) {
				configuracion = await res.json();
				panel.querySelector('.sk-imagen-tamanos').hidden = false;
				pintar();
			}
		} catch {
			// sin permiso de administrador: solo el interruptor
		}
	};

	// tocar el chip de Imagen (encendido o el gris) abre el panel en lugar de apagar/encender directo
	document.addEventListener(
		'click',
		(e) => {
			if (permitirClic) return;
			const chip = e.target.closest?.(`${COMPOSER} button`);
			if (chip && chip.querySelector(ICONO) && (chip.hasAttribute('aria-pressed') || chip.dataset.tipo === 'imagen')) {
				e.preventDefault();
				e.stopImmediatePropagation();
				if (chip.classList.contains('sk-imagen-abierto')) cerrar();
				else abrir(chip);
				return;
			}
			const panel = document.querySelector('.sk-imagen-panel');
			if (panel && !panel.contains(e.target) && !document.documentElement.classList.contains('sk-encendiendo')) cerrar();
		},
		true
	);

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') cerrar();
	});
})();
