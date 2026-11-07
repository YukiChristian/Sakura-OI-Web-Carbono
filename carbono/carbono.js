/*
 * Carbono 0.84 — comportamiento del tema. El lanzador lo sirve en /static/loader.js
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
	let cargando = false;
	let pendiente = false;

	const cargar = async () => {
		const headers = { Authorization: `Bearer ${localStorage.token}` };
		try {
			const { data } = await (await fetch('/api/models', { headers })).json();
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

	const mover = () => {
		pendiente = false;
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
 * hay y cuántas están activas (óvalo: total · activas) y abre una hoja de vidrio con ellas (carbono.css convierte la fila de chips de Open WebUI
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
