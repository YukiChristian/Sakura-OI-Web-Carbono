/*
 * Carbono 0.85 — comportamiento del tema. El lanzador lo sirve en /static/loader.js
 * (que Open WebUI carga en cada página) mientras exista carbono/ACTIVO.
 *
 * Barras de desplazamiento que solo aparecen mientras haces scroll: carbono.css las deja
 * transparentes y aquí se marca con .sk-scrolling el elemento que se está desplazando.
 */
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
	const CHIPS = "#message-input-container > div[dir='ltr'] > div:nth-child(2) > div";
	const DERECHA = "#message-input-container > div[dir='ltr'] > div:last-child";
	const BOTON = "#message-input-container button:has(path[d^='M10.5 6h9.75'])";
	const MODELO = '#model-selector-model-button';
	let conRazonamiento = null; // nombre del modelo -> { id, predeterminado } si tiene nivel de razonamiento
	let elecciones = {}; // id del modelo -> { razonamiento: nivel } elegido por el usuario (Ajustes)
	let idPorNombre = new Map(); // nombre visible -> id, para el avatar del chip del modelo
	let cargando = false;
	let pendiente = false;

	const cargar = async () => {
		const headers = { Authorization: `Bearer ${localStorage.token}` };
		try {
			const { data } = await (await fetch('/api/models', { headers })).json();
			// con nombres repetidos (persona y modelo crudo oculto) gana el visible
			idPorNombre = new Map();
			for (const m of data) {
				if (!idPorNombre.has(m.name) || !m.info?.meta?.hidden) idPorNombre.set(m.name, m.id);
			}
			for (const m of data.filter((x) => !x.info?.meta?.hidden)) idPorNombre.set(m.name, m.id);
			conRazonamiento = new Map(
				data
					.filter((m) => !m.pipe && !m.direct && Object.keys(m.info?.params?.model_controls ?? {}).length > 0)
					.map((m) => [m.name, { id: m.id, predeterminado: m.info.params.model_controls.razonamiento?.default }])
			);
			const ajustes = await (await fetch('/api/v1/users/user/settings', { headers })).json();
			elecciones = ajustes?.ui?.params?.model_controls ?? {};
		} catch {
			conRazonamiento ??= new Map();
		}
		mover();
	};

	// Composer elegido: el chip del modelo lleva el avatar del modelo a la izquierda del nombre
	const avatarModelo = () => {
		const chip = document.querySelector(`${MODELO} > div`);
		const id = idPorNombre.get(chip?.textContent.trim());
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
			if (localStorage.token && !cargando && document.querySelector(BOTON)) {
				cargando = true;
				cargar();
			}
			return;
		}
		const boton = document.querySelector(BOTON);
		const chips = document.querySelector(CHIPS);
		const envoltura = boton?.closest(`${DERECHA} > span, ${CHIPS} > span`);
		if (!envoltura || !chips) return;
		const modelo = conRazonamiento.get(document.querySelector(MODELO)?.textContent.trim());
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
	}).observe(document.documentElement, { childList: true, subtree: true });
})();

/*
 * Móvil (mockup L): botón "Herramientas y opciones" junto a Integraciones. Muestra cuántas opciones
 * hay y cuántas están activas ("3/4") y abre una hoja de vidrio con ellas (carbono.css convierte la fila de chips de Open WebUI
 * en esa hoja); tocar una fila es tocar el chip real. En escritorio el botón está oculto.
 */
(() => {
	const COMPOSER = '#message-input-container';
	const CHIPS = "#message-input-container > div[dir='ltr'] > div:nth-child(2)";
	const IZQUIERDA = "#message-input-container > div[dir='ltr'] > div:first-child";
	const ICONO =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg>';
	let pendiente = false;

	const cerrar = () => {
		const composer = document.querySelector(COMPOSER);
		composer?.classList.remove('sk-opciones-abiertas');
		document.querySelector('.sk-opciones-boton')?.setAttribute('aria-expanded', 'false');
		document.querySelector('.sk-opciones-velo')?.remove();
	};

	const abrir = (composer) => {
		composer.classList.add('sk-opciones-abiertas');
		document.querySelector('.sk-opciones-boton')?.setAttribute('aria-expanded', 'true');
		if (!document.querySelector('.sk-opciones-velo')) {
			const velo = document.createElement('div');
			velo.className = 'sk-opciones-velo';
			velo.addEventListener('click', cerrar);
			composer.parentElement.insertBefore(velo, composer);
		}
	};

	const actualizar = () => {
		pendiente = false;
		const composer = document.querySelector(COMPOSER);
		const izquierda = document.querySelector(IZQUIERDA);
		if (!composer || !izquierda) return;

		let boton = izquierda.querySelector('.sk-opciones-boton');
		if (!boton) {
			boton = document.createElement('button');
			boton.type = 'button';
			boton.className = 'sk-opciones-boton';
			boton.setAttribute('aria-expanded', 'false');
			boton.innerHTML = ICONO;
			boton.addEventListener('click', () => {
				const c = document.querySelector(COMPOSER);
				if (c.classList.contains('sk-opciones-abiertas')) cerrar();
				else abrir(c);
			});
			izquierda.appendChild(boton);
		}

		const chips = document.querySelector(CHIPS);
		const contenedor = chips?.querySelector(':scope > div');
		if (contenedor) sincronizarApagadas(contenedor);
		const opciones = chips ? [...chips.querySelectorAll('button')] : [];
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
	 * (.sk-fantasma) que los vuelve a encender desde el menú de Integraciones.
	 */
	const APAGABLES = [
		{ clave: 'herramientas', icono: 'M21.75 6.75', nombre: 'Herramientas', menu: 'Herramientas', cerrarMenu: false },
		{ clave: 'web', icono: 'M12 21a9.004', nombre: 'Búsqueda web', menu: 'Búsqueda Web', cerrarMenu: true }
	];
	let iconos = {};
	try {
		iconos = JSON.parse(sessionStorage.getItem('sk-opciones-iconos') || '{}');
	} catch {
		// sin sessionStorage: solo se recuerdan los íconos de esta página
	}

	const encender = async (apagable) => {
		const integraciones = document.querySelector('#integration-menu-button');
		integraciones?.click();
		for (let intento = 0; intento < 30; intento++) {
			await new Promise((r) => setTimeout(r, 50));
			const item = [...document.querySelectorAll("[role='menu'] [role^='menuitem']")].find((e) =>
				e.textContent.trim().startsWith(apagable.menu)
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
						sessionStorage.setItem('sk-opciones-iconos', JSON.stringify(iconos));
					} catch {
						// sin sessionStorage
					}
				}
				fantasma?.remove();
				anterior = hijoDirecto(contenedor, real);
				continue;
			}
			if (!iconos[apagable.clave]) continue;
			if (!fantasma) {
				fantasma = document.createElement('button');
				fantasma.type = 'button';
				fantasma.className = 'sk-fantasma sk-inactiva';
				fantasma.dataset.tipo = apagable.clave;
				fantasma.setAttribute('aria-label', `${apagable.nombre} (apagada)`);
				fantasma.innerHTML = iconos[apagable.clave];
				fantasma.addEventListener('click', () => encender(apagable));
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
			const [ajustes, { data }] = await Promise.all([pedir('/api/v1/users/user/settings'), pedir('/api/models')]);
			const ids = ajustes?.ui?.pinnedModels ?? [];
			modelosFijados = ids
				.map((id) => data.find((m) => m.id === id && !m.info?.meta?.hidden))
				.filter(Boolean)
				.map((m) => ({ id: m.id, nombre: m.name }));
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
