/*
 * Carbono 0.95.2 — comportamiento del tema. El lanzador lo sirve en /static/loader.js
 * (que Open WebUI carga en cada página) mientras exista carbono/ACTIVO.
 *
 * Barras de desplazamiento que solo aparecen mientras haces scroll: carbono.css las deja
 * transparentes y aquí se marca con .sk-scrolling el elemento que se está desplazando.
 */
/*
 * Sin transiciones mientras carga: el tema se aplica justo después de que Open WebUI pinta la página, y los botones con
 * transición (Nuevo Chat, píldoras, tarjeta del modelo…) se veían "cargar" con un fundido de su color de Open WebUI al
 * del tema. Hasta que la barra queda montada (o 3 s como mucho) las transiciones van apagadas y todo sale ya listo.
 */
(() => {
	const hoja = document.createElement('style');
	hoja.id = 'sk-sin-transicion';
	hoja.textContent = '*,*::before,*::after{transition:none!important}';
	(document.head || document.documentElement).appendChild(hoja);
	const inicio = performance.now();
	const quitar = () => requestAnimationFrame(() => requestAnimationFrame(() => hoja.remove()));
	const esperar = () => {
		// con la barra a la vista se espera a que el tema la arme; sin barra (teléfono), a que aparezca el chat
		const barra = document.querySelector('#sidebar');
		const conBarra = barra && barra.getBoundingClientRect().width > 0;
		const lista = conBarra
			? barra.querySelector('.sk-barra-extra, .sk-chats-envoltura')
			: document.querySelector('#chat-input, #messages-container, main');
		if (lista || performance.now() - inicio > 3000) setTimeout(quitar, 150);
		else requestAnimationFrame(esperar);
	};
	requestAnimationFrame(esperar);
})();
/*
 * Observador compartido (optimización): antes cada módulo tenía su propio MutationObserver sobre toda la página (26),
 * así que cada cambio de Open WebUI —por ejemplo, cada trozo de texto mientras responde— generaba 26 registros y
 * despertaba 26 funciones. Ahora hay uno solo que reparte: cada módulo recibe aviso solo de lo que le interesa
 * (nodos que entran o salen, texto o ciertos atributos). Los cambios que son solo de texto (la respuesta que se escribe)
 * se juntan y se avisan como mucho cada 120 ms, imperceptible a la vista; con la pestaña oculta no se trabaja y al
 * volver se avisa una vez.
 */
const skVigilar = (() => {
	const suscritos = [];
	const atributos = new Set();
	let observador = null;
	let textoPendiente = false;
	let temporizador = 0;
	let ocultoPendiente = false;

	const avisar = (hijos, texto, attrs) => {
		for (const s of suscritos) {
			if ((hijos && s.hijos) || (texto && s.texto) || (attrs.size && s.atributos && [...attrs].some((a) => s.atributos.has(a)))) {
				try {
					s.fn();
				} catch (e) {
					console.error('[sakura] módulo', e);
				}
			}
		}
	};

	const repartir = (registros) => {
		if (document.hidden) {
			ocultoPendiente = true;
			return;
		}
		let hijos = false;
		let texto = false;
		const attrs = new Set();
		for (const r of registros) {
			if (r.type === 'childList') hijos = true;
			else if (r.type === 'characterData') texto = true;
			else attrs.add(r.attributeName);
		}
		if (hijos || attrs.size) avisar(hijos, hijos && texto, attrs);
		// solo texto: se junta y se avisa con un pequeño retraso
		if (texto && !hijos) {
			textoPendiente = true;
			if (!temporizador) {
				temporizador = setTimeout(() => {
					temporizador = 0;
					if (!textoPendiente) return;
					textoPendiente = false;
					avisar(false, true, new Set());
				}, 120);
			}
		}
	};

	const observar = () => {
		if (observador) {
			const quedan = observador.takeRecords();
			observador.disconnect();
			if (quedan.length) repartir(quedan);
		}
		observador = new MutationObserver(repartir);
		observador.observe(document.documentElement, {
			childList: true,
			subtree: true,
			characterData: true,
			...(atributos.size ? { attributes: true, attributeFilter: [...atributos] } : {})
		});
	};

	document.addEventListener('visibilitychange', () => {
		if (!document.hidden && ocultoPendiente) {
			ocultoPendiente = false;
			avisar(true, true, new Set(atributos));
		}
	});

	return (fn, opciones = {}) => {
		const filtro = opciones.attributeFilter || null;
		if (filtro) filtro.forEach((a) => atributos.add(a));
		suscritos.push({
			fn,
			hijos: opciones.childList !== false,
			texto: Boolean(opciones.characterData),
			atributos: filtro ? new Set(filtro) : null
		});
		observar();
	};
})();

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
	 * Carga rápida: /api/v1/models/list (modelos guardados en Espacio de Trabajo, como Sakura, Lain y Yoko, con su
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
		if (razona && boton.dataset.skNivel !== nivel) boton.dataset.skNivel = nivel;
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

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(mover);
	}, {
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
		// Workspace, Web e Intérprete de código viven en el menú +: no cuentan en el contador
		// en el teléfono Open Terminal vive en el menú +: tampoco cuenta
		const opciones = (chips ? [...chips.querySelectorAll("button:not([aria-label='Choose working directory']):not(:has(path[d^='M21.75 6.75'])):not(:has(path[d^='M12 21a9.004'])):not([aria-label*='rprete de c' i]):not([aria-label*='code interpreter' i]):not(.sk-fantasma[data-tipo='web'])")] : []).filter((o) => !(window.matchMedia('(max-width: 767px)').matches && o.querySelector("path[d^='M12 4C6 4 6 8']")));
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
		sueltos(composer, izquierda, boton, opciones.length);
		compactos(composer, chips);
	};

	/*
	 * Teléfono: si en la fila caben las opciones como íconos de 40 px, van sueltas (.sk-chips-sueltos) en lugar de
	 * juntarse en el botón "3/4". Se mide con lo que ocupa lo demás (+, modelo con su nombre completo, micrófono y
	 * voz), no con el estado actual, para que no cambie de un modo a otro sin motivo.
	 */
	const telefono = window.matchMedia('(max-width: 767px)');
	const sueltos = (composer, izquierda, boton, n) => {
		if (composer.classList.contains('sk-opciones-abiertas')) return;
		let caben = false;
		const fila = izquierda.parentElement;
		if (telefono.matches && n > 0 && fila) {
			const ancho = (el) => el.getBoundingClientRect().width;
			// la fila (div[dir=ltr]) no tiene caja propia (mide 0 px): su ancho real va del borde izquierdo del primer
			// grupo (+) al borde derecho del último (modelo, micrófono y voz, que se estira hasta el final)
			const hijos = [...fila.children].filter((h) => h.getClientRects().length);
			if (hijos.length < 2) return;
			const caja = fila.getBoundingClientRect().width ? fila : fila.parentElement;
			const separacion = parseFloat(getComputedStyle(caja).columnGap) || 0;
			const lado = hijos[hijos.length - 1].getBoundingClientRect().right - hijos[0].getBoundingClientRect().left;
			let libre = lado - hijos.reduce((t, h) => t + ancho(h), 0) - (hijos.length - 1) * separacion;
			// más lo que el contenedor del modelo se estira de sobra (el chip del modelo con su nombre completo)
			const modelo = [...fila.querySelectorAll('#model-selector-model-button > div')].find((m) => m.getClientRects().length);
			if (modelo) {
				let contenedor = modelo;
				while (contenedor.parentElement && contenedor.parentElement.parentElement !== fila && contenedor.parentElement !== fila)
					contenedor = contenedor.parentElement;
				const nombre = [...modelo.querySelectorAll('*')].find((e) => e.scrollWidth > e.clientWidth + 1);
				const natural = ancho(modelo) + (nombre ? nombre.scrollWidth - nombre.clientWidth : 0);
				libre += Math.max(0, ancho(contenedor) - natural - 4);
			}
			// lo que ya ocupan las opciones ahora (el botón "3/4" o los íconos sueltos)
			const chips = fila.children[1];
			const actual = composer.classList.contains('sk-chips-sueltos') && chips ? ancho(chips) + 2 : ancho(boton) + 2;
			const necesario = n * 40 + (n - 1) * 4 + 2;
			caben = libre + actual >= necesario + 4;
		}
		if (composer.classList.contains('sk-chips-sueltos') !== caben) composer.classList.toggle('sk-chips-sueltos', caben);
	};
	/*
	 * Escritorio: si los chips con texto no caben en su espacio (la fila se recortaba y escondía alguno tras el
	 * desvanecido), van como bolitas (.sk-chips-compactos). Se recuerda qué ancho de caja hacía falta con texto para
	 * volver a ponerlo solo cuando de verdad quepa (sin parpadeo entre un modo y otro).
	 */
	const compactos = (composer, chips) => {
		let compacto = false;
		if (!telefono.matches && chips) {
			const firma = String(chips.querySelectorAll('button').length);
			if (composer.dataset.skChipsFirma !== firma) {
				composer.dataset.skChipsFirma = firma;
				delete composer.dataset.skAnchoTexto;
				composer.classList.remove('sk-chips-compactos');
			}
			const ancho = composer.clientWidth;
			if (composer.classList.contains('sk-chips-compactos')) {
				compacto = ancho < Number(composer.dataset.skAnchoTexto || 0);
			} else if (chips.scrollWidth > chips.clientWidth + 1) {
				composer.dataset.skAnchoTexto = String(ancho + (chips.scrollWidth - chips.clientWidth) + 12);
				compacto = true;
			}
		}
		if (composer.classList.contains('sk-chips-compactos') !== compacto) composer.classList.toggle('sk-chips-compactos', compacto);
	};
	telefono.addEventListener('change', () => requestAnimationFrame(actualizar));
	window.addEventListener('resize', () => requestAnimationFrame(actualizar));

	/*
	 * Open WebUI quita el chip de Web al apagarla (y el de Herramientas si no hay ninguna elegida), así que
	 * desaparecían de la hoja. Se recuerda su ícono y, mientras falten, la hoja muestra una fila apagada
	 * (.sk-fantasma) que los vuelve a encender desde el menú de Integraciones (o el "+" desde 0.13.1).
	 */
	const APAGABLES = [
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

	// Web e Intérprete de código viven en el menú +: se oculta su envoltorio entero (si solo se ocultara el botón,
	// el envoltorio vacío seguiría ocupando un hueco de separación en la fila)
	const SOLO_MENU =
		"button:has(path[d^='M12 21a9.004']), button[aria-label*='rprete de c' i], button[aria-label*='code interpreter' i]";
	const ocultarSoloMenu = (contenedor) => {
		for (const hijo of contenedor.children) {
			const oculto = Boolean(hijo.matches(SOLO_MENU) || hijo.querySelector(SOLO_MENU)) && !hijo.querySelector('.sk-fantasma');
			if (hijo.classList.contains('sk-chip-oculto') !== oculto) hijo.classList.toggle('sk-chip-oculto', oculto);
			const terminal = Boolean(hijo.querySelector("path[d^='M12 4C6 4 6 8']")) && !hijo.querySelector('.sk-fantasma');
			if (hijo.classList.contains('sk-chip-menu-tel') !== terminal) hijo.classList.toggle('sk-chip-menu-tel', terminal);
		}
	};

	const sincronizarApagadas = (contenedor) => {
		ocultarSoloMenu(contenedor);
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

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, {
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
		// los modelos y "Chats" van después del último acceso fijado (Notas, Espacio, Agenda…), no a media fila: así
		// Calendario queda con su grupo aunque se fije después
		const fijados = [...rail.querySelectorAll("a[href='/notes'], a[href='/workspace'], a[href='/calendar'], a[href='/automations'], a[href^='/playground']")];
		const ultimo = (fijados.at(-1) || rail.querySelector("a[href='/workspace']"))?.parentElement;
		const existente = rail.querySelector('.sk-chats-envoltura');
		if (existente) {
			if (ultimo && ultimo.nextElementSibling !== existente) ultimo.after(existente);
			return;
		}
		if (!modelosFijados) {
			if (localStorage.token && modelosFijados === null) {
				modelosFijados = undefined;
				cargarModelos();
			}
			return;
		}
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

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(asegurarBoton);
	}, { childList: true, subtree: true });
})();

/* Textos del selector de carpeta y del menú "+" (lienzos "Composer · Dirección de trabajo" y "Menú +"):
   Open WebUI 0.13.2 los deja en inglés o muy cortos. Solo se cambia el texto, sin tocar la estructura. */
(() => {
	const TEXTOS = {
		'No folder': 'Sin carpeta',
		'Open folder': 'Abrir carpeta…',
		// los tres botones de arriba del menú + llevan un nombre corto
		'Add Context': 'Contexto',
		'Añadir contexto': 'Contexto',
		'Subir Archivos': 'Archivos',
		'Subir archivos': 'Archivos',
		Captura: 'Captura',
		'Captura de pantalla': 'Captura',
		'Búsqueda Web': 'Búsqueda web',
		'Permisos de Herramientas': 'Permisos de Open Terminal'
	};
	const SUBTITULOS = {
		'Sin carpeta': 'El chat no usa ninguna carpeta'
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

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(traducir);
	}, { childList: true, subtree: true });
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
			// con una llamada de voz en curso el cajón se queda abierto (ahí vive el modo voz) y se muestra la pestaña Voz
			if (document.querySelector('button.sk-voz-boton')) {
				const voz = [...document.querySelectorAll("[role='tab']")].find((t) => t.querySelector("path[d^='M12 1C10.34']"));
				if (voz && voz.getAttribute('aria-selected') !== 'true') voz.click();
				return;
			}
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
		filaTerminal(menu);
		marcarApagadas(menu);
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
		const terminal = menu.querySelector('.sk-menu-terminal');
		if (terminal && fila.nextElementSibling !== terminal) fila.after(terminal);
		rotuloTrabajo(menu);
		const sub = fila.querySelector('.sk-workspace-sub');
		const texto = nombre || 'Sin carpeta';
		if (sub && sub.textContent !== texto) sub.textContent = texto;
		const etiqueta = `Workspace: ${texto}`;
		if (fila.getAttribute('aria-label') !== etiqueta) fila.setAttribute('aria-label', etiqueta);
	};

	// Open Terminal: en el teléfono su chip sale de la caja y vive aquí, debajo de Workspace
	const TERMINAL = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) button:has(path[d^='M12 4C6 4 6 8'])";
	// opciones apagadas del menú +: insignia gris y nombre atenuado (lienzo "Menú + con todo apagado")
	const marcarApagadas = (menu) => {
		const poner = (el, apagada) => {
			if (el && el.classList.contains('sk-apagada') !== apagada) el.classList.toggle('sk-apagada', apagada);
		};
		for (const fila of menu.querySelectorAll("[role='menuitemcheckbox']")) {
			const codigo = /rprete de c|code interpreter/i.test(fila.textContent);
			if (fila.classList.contains('sk-fila-codigo') !== codigo) fila.classList.toggle('sk-fila-codigo', codigo);
			poner(fila, fila.getAttribute('aria-checked') !== 'true');
		}
		const herramientas = menu.querySelector("[role='menuitem']:has(path[d^='M21.75 6.75'])");
		if (herramientas) {
			const elegidas = /([1-9]\d*)\s+seleccionad/i.test(herramientas.textContent);
			poner(herramientas, !elegidas);
			const titulo = herramientas.querySelector(':scope > div.justify-between > :first-child');
			if (titulo && !elegidas && !titulo.dataset.skSub) {
				titulo.dataset.skSub = 'Ninguna seleccionada';
				titulo.classList.add('sk-con-subtitulo', 'sk-sub-ninguna');
			} else if (titulo && elegidas && titulo.classList.contains('sk-sub-ninguna')) {
				delete titulo.dataset.skSub;
				titulo.classList.remove('sk-con-subtitulo', 'sk-sub-ninguna');
			}
		}
		const workspace = menu.querySelector('.sk-menu-workspace');
		if (workspace) poner(workspace, /sin carpeta/i.test(workspace.querySelector('.sk-workspace-sub')?.textContent || ''));
	};

	// rótulo "Trabajo" antes de Workspace y Open Terminal
	const rotuloTrabajo = (menu) => {
		const primera = menu.querySelector('.sk-menu-workspace') ?? menu.querySelector('.sk-menu-terminal');
		let rotulo = menu.querySelector('.sk-menu-trabajo');
		if (!primera) {
			rotulo?.remove();
			return;
		}
		if (!rotulo) {
			rotulo = document.createElement('div');
			rotulo.className = 'sk-menu-trabajo';
			rotulo.setAttribute('role', 'presentation');
			rotulo.textContent = 'Trabajo';
		}
		if (primera.previousElementSibling !== rotulo) primera.before(rotulo);
	};

	const filaTerminal = (menu) => {
		const chip = skVisible(TERMINAL);
		let fila = menu.querySelector('.sk-menu-terminal');
		if (!telefono.matches || !chip) {
			fila?.remove();
			rotuloTrabajo(menu);
			return;
		}
		if (!fila) {
			fila = document.createElement('button');
			fila.type = 'button';
			fila.setAttribute('role', 'menuitemcheckbox');
			fila.className = 'sk-menu-terminal';
			// el ícono del chip trae clases de tamaño (size-3.5): se copia limpio para que tome la insignia del menú
			const svg = chip.querySelector('svg')?.cloneNode(true);
			svg?.removeAttribute('class');
			svg?.setAttribute('stroke-width', '2');
			const icono = svg?.outerHTML ?? '';
			fila.innerHTML = `${icono}<div class="sk-terminal-textos"><div>Open Terminal</div><div class="sk-terminal-sub"></div></div><span class="sk-imagen-switch" aria-hidden="true"><span></span></span>`;
			fila.addEventListener('click', (e) => {
				e.stopPropagation();
				alternarTerminal();
			});
			const grupo = menu.querySelector("button:has(path[d^='M21.75 6.75'])")?.parentElement;
			if (!grupo) return;
			grupo.appendChild(fila);
		}
		// siempre justo debajo de Workspace (si está), dentro de Herramientas
		const workspace = menu.querySelector('.sk-menu-workspace');
		if (workspace && workspace.nextElementSibling !== fila) workspace.after(fila);
		rotuloTrabajo(menu);
		const elegida = !chip.classList.contains('opacity-50');
		const nombre = elegida ? chip.querySelector('span')?.textContent.trim() || chip.getAttribute('aria-label') || '' : '';
		if (nombre) {
			try {
				localStorage.setItem('sk-terminal-ultima', nombre);
			} catch {
				// sin localStorage: al encender se elige la primera terminal
			}
		}
		const texto = nombre || 'Sin terminal';
		const sub = fila.querySelector('.sk-terminal-sub');
		if (sub && sub.textContent !== texto) sub.textContent = texto;
		fila.setAttribute('aria-checked', elegida ? 'true' : 'false');
		fila.querySelector('.sk-imagen-switch')?.setAttribute('aria-checked', elegida ? 'true' : 'false');
		if (fila.classList.contains('sk-apagada') === elegida) fila.classList.toggle('sk-apagada', !elegida);
		const etiqueta = `Open Terminal: ${texto}`;
		if (fila.getAttribute('aria-label') !== etiqueta) fila.setAttribute('aria-label', etiqueta);
	};

	// encender/apagar: se abre invisible el selector de terminal de Open WebUI y se toca la terminal (tocar la
	// elegida la quita); así se guarda igual que desde el chip
	const alternarTerminal = async () => {
		const chip = skVisible(TERMINAL);
		if (!chip) return;
		const elegida = !chip.classList.contains('opacity-50');
		const actual = elegida ? chip.querySelector('span')?.textContent.trim() || chip.getAttribute('aria-label') || '' : '';
		let ultima = '';
		try {
			ultima = localStorage.getItem('sk-terminal-ultima') || '';
		} catch {
			// sin localStorage
		}
		document.documentElement.classList.add('sk-encendiendo');
		document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		await new Promise((r) => setTimeout(r, 150));
		chip.click();
		for (let intento = 0; intento < 30; intento++) {
			await new Promise((r) => setTimeout(r, 50));
			const opciones = [...document.querySelectorAll("[role='menu'] .app-dropdown-menu button")].filter(
				(b) => !b.closest('.sk-menu-mas') && b.textContent.trim() && !/add terminal|agregar terminal|añadir terminal/i.test(b.getAttribute('aria-label') || '')
			);
			if (!opciones.length) continue;
			const nombreDe = (b) => b.textContent.trim();
			const objetivo = elegida
				? opciones.find((b) => nombreDe(b) === actual) ?? opciones.find((b) => nombreDe(b).startsWith(actual))
				: opciones.find((b) => nombreDe(b) === ultima) ?? opciones[0];
			if (objetivo) objetivo.click();
			else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
			break;
		}
		setTimeout(() => document.documentElement.classList.remove('sk-encendiendo'), 300);
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(asegurar);
	}, { childList: true, subtree: true });
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

	// Open Terminal: en el teléfono su chip sale de la caja y vive aquí, debajo de Workspace
	const TERMINAL = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) button:has(path[d^='M12 4C6 4 6 8'])";
	// opciones apagadas del menú +: insignia gris y nombre atenuado (lienzo "Menú + con todo apagado")
	const marcarApagadas = (menu) => {
		const poner = (el, apagada) => {
			if (el && el.classList.contains('sk-apagada') !== apagada) el.classList.toggle('sk-apagada', apagada);
		};
		for (const fila of menu.querySelectorAll("[role='menuitemcheckbox']")) {
			const codigo = /rprete de c|code interpreter/i.test(fila.textContent);
			if (fila.classList.contains('sk-fila-codigo') !== codigo) fila.classList.toggle('sk-fila-codigo', codigo);
			poner(fila, fila.getAttribute('aria-checked') !== 'true');
		}
		const herramientas = menu.querySelector("[role='menuitem']:has(path[d^='M21.75 6.75'])");
		if (herramientas) {
			const elegidas = /([1-9]\d*)\s+seleccionad/i.test(herramientas.textContent);
			poner(herramientas, !elegidas);
			const titulo = herramientas.querySelector(':scope > div.justify-between > :first-child');
			if (titulo && !elegidas && !titulo.dataset.skSub) {
				titulo.dataset.skSub = 'Ninguna seleccionada';
				titulo.classList.add('sk-con-subtitulo', 'sk-sub-ninguna');
			} else if (titulo && elegidas && titulo.classList.contains('sk-sub-ninguna')) {
				delete titulo.dataset.skSub;
				titulo.classList.remove('sk-con-subtitulo', 'sk-sub-ninguna');
			}
		}
		const workspace = menu.querySelector('.sk-menu-workspace');
		if (workspace) poner(workspace, /sin carpeta/i.test(workspace.querySelector('.sk-workspace-sub')?.textContent || ''));
	};

	// rótulo "Trabajo" antes de Workspace y Open Terminal
	const rotuloTrabajo = (menu) => {
		const primera = menu.querySelector('.sk-menu-workspace') ?? menu.querySelector('.sk-menu-terminal');
		let rotulo = menu.querySelector('.sk-menu-trabajo');
		if (!primera) {
			rotulo?.remove();
			return;
		}
		if (!rotulo) {
			rotulo = document.createElement('div');
			rotulo.className = 'sk-menu-trabajo';
			rotulo.setAttribute('role', 'presentation');
			rotulo.textContent = 'Trabajo';
		}
		if (primera.previousElementSibling !== rotulo) primera.before(rotulo);
	};

	const filaTerminal = (menu) => {
		const chip = skVisible(TERMINAL);
		let fila = menu.querySelector('.sk-menu-terminal');
		if (!telefono.matches || !chip) {
			fila?.remove();
			rotuloTrabajo(menu);
			return;
		}
		if (!fila) {
			fila = document.createElement('button');
			fila.type = 'button';
			fila.setAttribute('role', 'menuitem');
			fila.className = 'sk-menu-terminal';
			const icono = chip.querySelector('svg')?.outerHTML ?? '';
			fila.innerHTML = `${icono}<div class="justify-between"><div>Open Terminal</div><div><div class="sk-terminal-sub"></div>${SVG_FLECHA}</div></div>`;
			fila.addEventListener('click', (e) => {
				e.stopPropagation();
				document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				setTimeout(() => skVisible(TERMINAL)?.click(), 120);
			});
			const grupo = menu.querySelector("button:has(path[d^='M21.75 6.75'])")?.parentElement;
			if (!grupo) return;
			grupo.appendChild(fila);
		}
		// siempre justo debajo de Workspace (si está), dentro de Herramientas
		const workspace = menu.querySelector('.sk-menu-workspace');
		if (workspace && workspace.nextElementSibling !== fila) workspace.after(fila);
		rotuloTrabajo(menu);
		const elegida = !chip.classList.contains('opacity-50');
		const nombre = elegida ? chip.querySelector('span')?.textContent.trim() || chip.getAttribute('aria-label') || '' : '';
		const texto = nombre || 'Sin terminal';
		const sub = fila.querySelector('.sk-terminal-sub');
		if (sub && sub.textContent !== texto) sub.textContent = texto;
		if (fila.classList.contains('sk-apagada') === elegida) fila.classList.toggle('sk-apagada', !elegida);
		const etiqueta = `Open Terminal: ${texto}`;
		if (fila.getAttribute('aria-label') !== etiqueta) fila.setAttribute('aria-label', etiqueta);
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(asegurar);
	}, {
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

	// en el teléfono los chips están ocultos (Imagen vive en el menú +): si no hay uno visible vale el oculto
	const primeroVisible = (lista) => lista.find((b) => b.getClientRects().length) ?? lista[0];
	const chipReal = () =>
		primeroVisible([...document.querySelectorAll(`${COMPOSER} button[aria-pressed]`)].filter((b) => b.querySelector(ICONO)));
	const chipGris = () => primeroVisible([...document.querySelectorAll(`${COMPOSER} .sk-fantasma[data-tipo='imagen']`)]);
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

	// la fila Imagen del menú + del teléfono abre este panel y lee el tamaño elegido
	window.skImagen = {
		abrir: () => {
			const chip = chipReal() ?? chipGris();
			if (chip) abrir(chip);
		},
		tamano: async () => {
			if (!configuracion) {
				try {
					const res = await fetch('/api/v1/images/config', { headers: headers() });
					if (res.ok) configuracion = await res.json();
				} catch {
					// sin permiso de administrador
				}
			}
			return configuracion?.IMAGE_SIZE ?? '';
		}
	};
})();

/*
 * Teléfono (lienzo "Menú + reorganizado" y "+ con mini insignias"): la caja de mensaje lleva solo el + con una
 * bolita de color por opción activa; Imagen y Razonamiento pasan al menú + (Imagen con su tamaño, interruptor y
 * flecha al panel de tamaños; Razonamiento con su nivel, que abre el selector de nivel).
 */
(() => {
	const telefono = window.matchMedia('(max-width: 767px)');
	const COMPOSER = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper'])";
	const ICONO_IMAGEN = "path[d^='M21 7.6V20.4']";
	const NIVELES = { apagado: 'Apagado', bajo: 'Bajo', medio: 'Medio', alto: 'Alto', adaptable: 'Adaptable' };
	const SVG_FLECHA =
		'<svg class="sk-fila-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m8.25 4.5 7.5 7.5-7.5 7.5"/></svg>';
	let pendiente = false;
	let tamano = '';
	let pidiendoTamano = false;

	const activas = (composer) => {
		const chips = composer.querySelector(":scope > div[dir='ltr'] > div:nth-child(2)");
		if (!chips) return [];
		const lista = [];
		const herr = chips.querySelector("button:has(path[d^='M21.75 6.75'])");
		if (herr && /[1-9]/.test(herr.textContent)) lista.push('herramientas');
		if (chips.querySelector("button:not(.sk-fantasma):has(path[d^='M12 21a9.004'])")) lista.push('web');
		if (chips.querySelector(`button[aria-pressed='true']:has(${ICONO_IMAGEN})`)) lista.push('imagen');
		if (chips.querySelector("button[aria-pressed='true']:is([aria-label*='rprete de c' i], [aria-label*='code interpreter' i])")) lista.push('codigo');
		const razona = chips.querySelector('button.sk-razonamiento');
		if (razona && !razona.classList.contains('sk-apagado')) lista.push('razonamiento');
		const terminal = chips.querySelector("button:has(path[d^='M12 4C6 4 6 8'])");
		if (terminal && !terminal.classList.contains('opacity-50')) lista.push('terminal');
		return lista;
	};

	const insigniasMas = () => {
		document.querySelectorAll(COMPOSER).forEach((composer) => {
			const mas = composer.querySelector("#input-menu-button, [id$='-input-menu-button']");
			if (!mas) return;
			let caja = mas.querySelector('.sk-mas-insignias');
			const lista = telefono.matches ? activas(composer) : [];
			const firma = lista.join(',');
			if (!caja && !lista.length) return;
			if (!caja) {
				caja = document.createElement('span');
				caja.className = 'sk-mas-insignias';
				caja.setAttribute('aria-hidden', 'true');
				mas.appendChild(caja);
			}
			if (caja.dataset.firma === firma) return;
			caja.dataset.firma = firma;
			caja.innerHTML = lista.map((t) => `<i class="sk-insignia-${t}"></i>`).join('');
			mas.classList.toggle('sk-mas-con-insignias', lista.length > 0);
		});
	};

	const fila = (menu, clase, crear) => {
		let el = menu.querySelector(`.${clase}`);
		if (el) return el;
		const grupo = menu.querySelector("button:has(path[d^='M21.75 6.75'])")?.parentElement;
		if (!grupo) return null;
		el = crear();
		el.classList.add(clase);
		grupo.appendChild(el);
		return el;
	};

	const filasMenu = () => {
		const menu = document.querySelector('.app-dropdown-menu.sk-menu-mas');
		if (!menu) return;
		if (!telefono.matches) {
			menu.querySelectorAll('.sk-menu-imagen, .sk-menu-razonamiento-fila').forEach((e) => e.remove());
			return;
		}
		const composer = skVisible(COMPOSER);
		if (!composer) return;

		// Imagen: solo si Open WebUI la ofrece (su opción nativa está en el menú, oculta)
		const nativa = menu.querySelector(`[role='menuitemcheckbox']:has(${ICONO_IMAGEN}):not(.sk-menu-imagen)`);
		if (nativa) {
			const img = fila(menu, 'sk-menu-imagen', () => {
				const b = document.createElement('button');
				b.type = 'button';
				b.setAttribute('role', 'menuitemcheckbox');
				const svg = nativa.querySelector('svg')?.cloneNode(true);
				svg?.removeAttribute('class');
				b.innerHTML = `${svg?.outerHTML ?? ''}<div class="sk-fila-textos"><div>Imagen</div><div class="sk-fila-sub"></div></div>${SVG_FLECHA}<span class="sk-imagen-switch" aria-hidden="true"><span></span></span>`;
				b.addEventListener('click', (e) => {
					e.stopPropagation();
					if (e.target.closest('.sk-imagen-switch')) {
						menu.querySelector(`[role='menuitemcheckbox']:has(${ICONO_IMAGEN}):not(.sk-menu-imagen)`)?.click();
						return;
					}
					document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
					setTimeout(() => window.skImagen?.abrir(), 150);
				});
				return b;
			});
			if (img) {
				const on = nativa.getAttribute('aria-checked') === 'true';
				img.setAttribute('aria-checked', on ? 'true' : 'false');
				img.querySelector('.sk-imagen-switch')?.setAttribute('aria-checked', on ? 'true' : 'false');
				if (img.classList.contains('sk-apagada') === on) img.classList.toggle('sk-apagada', !on);
				if (!tamano && !pidiendoTamano && window.skImagen) {
					pidiendoTamano = true;
					window.skImagen.tamano().then((t) => {
						tamano = t;
						programar();
					});
				}
				const sub = img.querySelector('.sk-fila-sub');
				const texto = tamano ? tamano.replace('x', '×') : '';
				if (sub && sub.textContent !== texto) sub.textContent = texto;
			}
		}

		// Razonamiento: solo con un modelo que razona
		const chip = composer.querySelector('button.sk-razonamiento');
		let raz = menu.querySelector('.sk-menu-razonamiento-fila');
		if (!chip) raz?.remove();
		else {
			raz = fila(menu, 'sk-menu-razonamiento-fila', () => {
				const b = document.createElement('button');
				b.type = 'button';
				b.setAttribute('role', 'menuitem');
				const svg = chip.querySelector('svg')?.cloneNode(true);
				svg?.removeAttribute('class');
				b.innerHTML = `${svg?.outerHTML ?? ''}<div class="sk-fila-textos"><div>Razonamiento</div><div class="sk-fila-sub"></div></div>${SVG_FLECHA}`;
				b.addEventListener('click', (e) => {
					e.stopPropagation();
					document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
					setTimeout(() => skVisible(`${COMPOSER} button.sk-razonamiento`)?.click(), 150);
				});
				return b;
			});
			if (raz) {
				const nivel = chip.dataset.skNivel || '';
				const apagado = chip.classList.contains('sk-apagado');
				if (raz.classList.contains('sk-apagada') !== apagado) raz.classList.toggle('sk-apagada', apagado);
				const sub = raz.querySelector('.sk-fila-sub');
				const texto = NIVELES[nivel] ?? (nivel ? nivel[0].toUpperCase() + nivel.slice(1) : '');
				if (sub && sub.textContent !== texto) sub.textContent = texto;
			}
		}
	};

	const actualizar = () => {
		pendiente = false;
		insigniasMas();
		filasMenu();
	};
	const programar = () => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	};
	skVigilar(programar, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['aria-pressed', 'aria-checked', 'class']
	});
	telefono.addEventListener('change', programar);
})();

/*
 * Bienvenida con pétalos por modelo (lienzo "Pétalos · Sakura / Yoko / Lain"): en la pantalla de nuevo chat el
 * avatar del modelo va grande y centrado, con pétalos y sombra en los colores de su ícono. Los colores se sacan del
 * propio avatar (dibujado en un lienzo de 32 × 32, ~1 ms) cada vez que cambia, así que un ícono nuevo o un modelo
 * nuevo toma sus colores solo; el último resultado se guarda para pintarlo al instante.
 */
(() => {
	const PETALO = 'M12 2c3 3 4 7 0 12C8 9 9 5 12 2z';
	// [izquierda, arriba, tamaño, giro, opacidad, tono] sobre una caja de 170 px con el avatar de 140 px al centro
	const PETALOS = [
		[-10, 20, 26, -30, 0.9, 'claro'],
		[150, 0, 22, 40, 0.8, 'fuerte'],
		[170, 110, 28, 110, 0.85, 'claro'],
		[-24, 120, 20, 200, 0.7, 'fuerte'],
		[60, -26, 18, 10, 0.75, 'claro'],
		[120, 170, 18, 160, 0.6, 'fuerte'],
		[10, 175, 16, 250, 0.6, 'claro']
	];
	const CLAVE = 'sk-petalos-colores';
	let cache = {};
	try {
		cache = JSON.parse(localStorage.getItem(CLAVE) || '{}');
	} catch {
		// sin localStorage: se calcula en cada carga
	}
	let pendiente = false;

	const hsl = (r, g, b) => {
		r /= 255;
		g /= 255;
		b /= 255;
		const max = Math.max(r, g, b);
		const min = Math.min(r, g, b);
		const l = (max + min) / 2;
		if (max === min) return [0, 0, l];
		const d = max - min;
		const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
		let h;
		if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
		else if (max === g) h = (b - r) / d + 2;
		else h = (r - g) / d + 4;
		return [h * 60, s, l];
	};

	// dos tonos dominantes del avatar: el más presente (claro) y otro de tono distinto si lo hay (fuerte)
	const calcular = (img) => {
		const lienzo = document.createElement('canvas');
		lienzo.width = lienzo.height = 32;
		const ctx = lienzo.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(img, 0, 0, 32, 32);
		const datos = ctx.getImageData(0, 0, 32, 32).data;
		const cubetas = Array.from({ length: 24 }, () => ({ peso: 0, s: 0, l: 0, x: 0, y: 0 }));
		for (let i = 0; i < datos.length; i += 4) {
			if (datos[i + 3] < 128) continue;
			const [h, s, l] = hsl(datos[i], datos[i + 1], datos[i + 2]);
			if (s < 0.18 || l < 0.12 || l > 0.93) continue; // blancos, negros y grises no cuentan
			// tonos piel (anaranjado claro poco saturado): casi no cuentan, para que manden el pelo, la ropa y el fondo
			const piel = h >= 10 && h <= 45 && l > 0.5 && s < 0.75;
			const peso = s * (1 - Math.abs(l - 0.55)) * (piel ? 0.15 : 1);
			const c = cubetas[Math.floor(h / 15) % 24];
			c.peso += peso;
			c.s += s * peso;
			c.l += l * peso;
			c.x += Math.cos((h * Math.PI) / 180) * peso;
			c.y += Math.sin((h * Math.PI) / 180) * peso;
		}
		const orden = cubetas
			.map((c, i) => ({ ...c, i }))
			.filter((c) => c.peso > 0)
			.sort((a, b) => b.peso - a.peso);
		if (!orden.length) return { claro: 'hsl(220 14% 82%)', fuerte: 'hsl(220 14% 60%)', anillo: 'hsl(220 14% 92%)', sombra: 'hsl(220 14% 40% / 0.22)' };
		const tono = (c) => ({
			h: Math.round(((Math.atan2(c.y, c.x) * 180) / Math.PI + 360) % 360),
			s: c.s / c.peso,
			l: c.l / c.peso
		});
		const a = tono(orden[0]);
		const distancia = (x, y) => Math.min(Math.abs(x - y), 360 - Math.abs(x - y));
		// tono fuerte: de la misma familia que el claro pero más oscuro (rosa fuerte, rojo oscuro, azul marino…): el
		// tono más presente a menos de 45° del principal y más oscuro que él; si no hay, el principal oscurecido
		const cerca = orden.filter((c) => c !== orden[0] && distancia(tono(c).h, a.h) <= 45 && tono(c).l < a.l - 0.08);
		const oscuro = cerca[0] ? tono(cerca[0]) : null;
		const b = oscuro ? { ...oscuro, l: Math.min(0.5, Math.max(0.3, oscuro.l)) } : { ...a, l: 0.42 };
		const sat = (s, max) => Math.round(Math.min(max, Math.max(0.6, s * 1.25)) * 100); // tonos vivos aunque el avatar sea suave
		return {
			claro: `hsl(${a.h} ${sat(a.s, 0.8)}% 78%)`,
			fuerte: `hsl(${b.h} ${sat(b.s, 0.7)}% ${Math.round(b.l * 100)}%)`,
			anillo: `hsl(${a.h} ${sat(a.s, 0.7)}% 90%)`,
			sombra: `hsl(${a.h} ${sat(a.s, 0.7)}% 40% / 0.24)`,
			// tonos en número para la barra lateral (color del modelo): principal y fuerte
			h: a.h,
			fh: b.h,
			fs: b.s,
			fl: b.l
		};
	};
	// la barra lateral usa el mismo cálculo para el color de cada modelo
	window.skCalcularColores = calcular;

	const pintar = (caja, c) => {
		caja.style.setProperty('--sk-petalo-claro', c.claro);
		caja.style.setProperty('--sk-petalo-fuerte', c.fuerte);
		caja.style.setProperty('--sk-petalo-anillo', c.anillo);
		caja.style.setProperty('--sk-petalo-sombra', c.sombra);
	};

	const preparar = () => {
		pendiente = false;
		const imgs = [...document.querySelectorAll("img[src^='/api/v1/models/model/profile/image']")].filter(
			(i) => i.closest('div.flex.justify-start') && !i.closest('#sidebar, nav, [role="menu"], #message-input-container')
		);
		for (const img of imgs) {
			const fila = img.closest('div.flex.justify-start');
			const caja = fila?.parentElement;
			if (!caja) continue;
			// con varios modelos a la vez se deja la bienvenida de Open WebUI
			const varios = fila.querySelectorAll('img').length > 1;
			caja.classList.toggle('sk-bienvenida', !varios);
			fila.classList.toggle('sk-bienvenida-avatar', !varios);
			if (varios) continue;
			const ancla = img.parentElement;
			if (!ancla.querySelector(':scope > .sk-petalos')) {
				const petalos = document.createElement('span');
				petalos.className = 'sk-petalos';
				petalos.setAttribute('aria-hidden', 'true');
				petalos.innerHTML = PETALOS.map(
					([x, y, t, g, o, tono]) =>
						`<svg viewBox="0 0 24 24" style="left:${x}px;top:${y}px;width:${t}px;height:${t}px;transform:rotate(${g}deg);opacity:${o}"><path d="${PETALO}" fill="var(--sk-petalo-${tono})"/></svg>`
				).join('');
				ancla.appendChild(petalos);
			}
			const src = img.getAttribute('src');
			if (cache[src] && caja.dataset.skPetalos !== src) pintar(caja, cache[src]);
			const listo = () => {
				if (caja.dataset.skPetalosHecho === src + img.naturalWidth) return;
				caja.dataset.skPetalosHecho = src + img.naturalWidth;
				try {
					const c = calcular(img);
					pintar(caja, c);
					if (JSON.stringify(cache[src]) !== JSON.stringify(c)) {
						cache[src] = c;
						try {
							localStorage.setItem(CLAVE, JSON.stringify(cache));
						} catch {
							// sin localStorage
						}
					}
				} catch {
					// imagen de otro origen: se queda con el color guardado o el de respaldo
				}
			};
			caja.dataset.skPetalos = src;
			if (img.complete && img.naturalWidth) listo();
			else img.addEventListener('load', listo, { once: true });
		}
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(preparar);
	}, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
})();

/*
 * Ajustes en el teléfono: la fila de pestañas se desliza también con la rueda del ratón y arrastrando, marca con
 * .sk-hay-mas que quedan pestañas a la derecha (desvanecido) y acomoda la pestaña activa a la vista.
 */
(() => {
	const preparadas = new WeakSet();
	let pendiente = false;

	const marcar = (fila) => {
		const hayMas = fila.scrollLeft + fila.clientWidth < fila.scrollWidth - 4;
		if (fila.classList.contains('sk-hay-mas') !== hayMas) fila.classList.toggle('sk-hay-mas', hayMas);
	};

	const preparar = (fila) => {
		if (preparadas.has(fila)) return;
		preparadas.add(fila);
		fila.addEventListener('scroll', () => marcar(fila), { passive: true });
		// rueda vertical → desplazamiento horizontal (solo cuando la fila va en horizontal)
		fila.addEventListener(
			'wheel',
			(e) => {
				if (getComputedStyle(fila).flexDirection !== 'row' || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
				fila.scrollLeft += e.deltaY;
				e.preventDefault();
			},
			{ passive: false }
		);
		// arrastrar con el ratón; un arrastre de más de 5 px no cuenta como clic en la pestaña
		let inicio = null;
		let movido = false;
		fila.addEventListener('pointerdown', (e) => {
			if (e.pointerType !== 'mouse' || getComputedStyle(fila).flexDirection !== 'row') return;
			inicio = { x: e.clientX, scroll: fila.scrollLeft };
			movido = false;
		});
		window.addEventListener('pointermove', (e) => {
			if (!inicio) return;
			const dx = e.clientX - inicio.x;
			if (Math.abs(dx) > 5) {
				movido = true;
				fila.classList.add('sk-arrastrando');
			}
			if (movido) fila.scrollLeft = inicio.scroll - dx;
		});
		window.addEventListener('pointerup', () => {
			inicio = null;
			fila.classList.remove('sk-arrastrando');
		});
		fila.addEventListener(
			'click',
			(e) => {
				if (!movido) return;
				movido = false;
				e.preventDefault();
				e.stopPropagation();
			},
			true
		);
	};

	const actualizar = () => {
		pendiente = false;
		const fila = document.querySelector('#settings-tabs-container .tabs');
		if (!fila) return;
		preparar(fila);
		marcar(fila);
		const activa = fila.querySelector("[role='tab'][aria-selected='true']");
		if (activa && getComputedStyle(fila).flexDirection === 'row' && fila.dataset.skActiva !== activa.textContent) {
			fila.dataset.skActiva = activa.textContent;
			activa.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		}
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
})();

/*
 * Modo voz animado (lienzo "Móvil · Modo voz animado", versión 2 "Azul y negro, rojo solo al silenciar"). Open WebUI
 * cambia el avatar por un ícono de carga al pensar y
 * al responder, y por el emoji en las reacciones; aquí se monta una escena propia que se queda en los tres estados:
 *   escuchando   → el avatar late, salen 3 ondas y un medidor de 9 barras sigue tu voz
 *   pensando     → el avatar respira, un aro gira y una burbuja con 3 bolitas aparece arriba a la derecha
 *   respondiendo → el avatar "habla" y salen ondas; la reacción sale en un círculo abajo a la derecha
 *   silenciado   → el avatar queda en gris y quieto, con aro punteado e insignia del micrófono tachado
 * Azul para lo que pasa, negro para los botones y rojo solo para el micrófono silenciado.
 */
(() => {
	const BOTON = [
		"button[aria-label='Llamada de voz']",
		"button[aria-label='Interrumpir al asistente']",
		"button[aria-label='Voice call']",
		"button[aria-label='Stop speaking']"
	].join(',');
	let pendiente = false;
	// solo se escribe si cambia (escribir el mismo valor dispara el observador y haría un ciclo sin fin)
	const poner = (el, prop, valor) => {
		if (el.style.getPropertyValue(prop) !== valor) el.style.setProperty(prop, valor);
	};

	const estadoDe = (texto, mudo) => {
		const t = (texto || '').toLowerCase();
		if (mudo || /muted|silenciad/.test(t)) return 'silenciado';
		if (/pensando|thinking/.test(t)) return 'pensando';
		if (/interrump|interrupt/.test(t)) return 'respondiendo';
		return 'escuchando';
	};

	const montar = (boton) => {
		let escena = boton.querySelector(':scope > .sk-voz-escena');
		if (escena) return escena;
		escena = document.createElement('span');
		escena.className = 'sk-voz-escena';
		escena.setAttribute('aria-hidden', 'true');
		escena.innerHTML = `
			<span class="sk-voz-ondas"><i></i><i></i><i></i></span>
			<span class="sk-voz-aro"></span>
			<img class="sk-voz-avatar" alt="">
			<span class="sk-voz-burbuja"><i></i><i></i><i></i></span>
			<span class="sk-voz-reaccion"></span>
			<span class="sk-voz-punteado"></span>
			<span class="sk-voz-mudo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3M3 3l18 18"/></svg></span>`;
		boton.appendChild(escena);
		return escena;
	};

	const actualizar = () => {
		pendiente = false;
		if (!document.querySelector(BOTON)) {
			document.querySelectorAll('[data-sk-voz-junto]').forEach((r) => r.removeAttribute('data-sk-voz-junto'));
		}
		document.querySelectorAll(BOTON).forEach((boton) => {
			// con un avatar animado propio (video/Live2D) se deja el de Open WebUI
			if (boton.classList.contains('min-h-64')) return;
			const escena = montar(boton);
			if (!boton.classList.contains('sk-voz-boton')) boton.classList.add('sk-voz-boton');

			// avatar: se toma de la imagen de fondo que pone Open WebUI mientras escucha
			const fondo = boton.querySelector(":scope > div.bg-cover[style*='voice=true']");
			const url = fondo?.getAttribute('style')?.match(/url\(['"]?([^'")]+)['"]?\)/)?.[1];
			const img = escena.querySelector('.sk-voz-avatar');
			if (url && img.getAttribute('src') !== url) img.src = url;
			// nivel de tu voz: Open WebUI agranda su avatar con el volumen (size-40 … size-52)
			const nivel = fondo ? ['size-40', 'size-44', 'size-48', 'size-52'].findIndex((c) => fondo.classList.contains(c)) : 0;

			// reacción: Open WebUI pone el emoji en lugar del avatar
			const emoji = [...boton.querySelectorAll(':scope > div.rounded-full:not(.bg-cover)')].find((d) => d.textContent.trim());
			const reaccion = escena.querySelector('.sk-voz-reaccion');
			// cada reacción nueva sale con su rebote, aunque sea el mismo emoji que la anterior
			if (emoji && (emoji !== escena.skEmoji || reaccion.textContent !== emoji.textContent.trim())) {
				escena.skEmoji = emoji;
				reaccion.textContent = emoji.textContent.trim();
				reaccion.classList.remove('sk-voz-salta');
				void reaccion.offsetWidth;
				reaccion.classList.add('sk-voz-salta');
			}
			if (!emoji) escena.skEmoji = null;

			// estado: del texto de abajo ("Escuchando...", "Pensando...", "Toca para interrumpir")
			const raiz = boton.closest('.flex-col')?.parentElement ?? document;
			const estadoBoton = raiz.querySelector("[role='status'][aria-live]:not([data-sonner-toast]) > button") ??
				document.querySelector("[role='status'][aria-live]:not([data-sonner-toast]) > button");
			const mudo = Boolean(raiz.querySelector("button[aria-label='Unmute'], button[aria-label='Activar micrófono']"));
			const estado = estadoDe(estadoBoton?.textContent, mudo);
			if (estado !== 'respondiendo' && reaccion.textContent && !emoji) reaccion.textContent = '';
			for (const e of ['escuchando', 'pensando', 'respondiendo', 'silenciado']) if (boton.classList.contains(`sk-voz-${e}`) !== (e === estado)) boton.classList.toggle(`sk-voz-${e}`, e === estado);
			poner(escena, '--sk-voz-nivel', String(Math.max(0, nivel)));
			// al escuchar, las ondas y el latido solo van mientras se detecta tu voz (se sostienen 400 ms para no parpadear)
			if (nivel > 0) escena.skSonido = Date.now();
			const conSonido = estado === 'escuchando' && Date.now() - (escena.skSonido || 0) < 400;
			if (boton.classList.contains('sk-voz-con-sonido') !== conSonido) boton.classList.toggle('sk-voz-con-sonido', conSonido);
			clearTimeout(escena.skApagar);
			if (conSonido) escena.skApagar = setTimeout(() => requestAnimationFrame(actualizar), 450);

			// medidor de 9 barras junto al estado (solo al escuchar) y color del punto del estado
			const caja = estadoBoton?.parentElement;
			if (caja) {
				if (caja.dataset.skVoz !== estado) caja.dataset.skVoz = estado;
				const sonido = boton.classList.contains('sk-voz-con-sonido') ? 'si' : 'no';
				if (caja.dataset.skSonido !== sonido) caja.dataset.skSonido = sonido;
				if (!caja.querySelector(':scope > .sk-voz-medidor')) {
					const medidor = document.createElement('span');
					medidor.className = 'sk-voz-medidor';
					medidor.setAttribute('aria-hidden', 'true');
					medidor.innerHTML = '<i></i>'.repeat(9);
					caja.insertBefore(medidor, estadoBoton);
				}
				poner(caja.querySelector(':scope > .sk-voz-medidor'), '--sk-voz-nivel', String(Math.max(0, nivel)));
			}

			// columna del modo voz en escritorio: su posición y ancho reales (estilo en línea de Open WebUI; con la vista
			// dividida es la columna izquierda) para repartirla entre el chat y el panel de voz (carbono.css)
			const panelVoz = boton.closest("[role='tabpanel']");
			const panelChat = document.getElementById('chat-panel-main-chat-view');
			const raizPaneles = panelChat?.parentElement;
			if (panelVoz && !panelVoz.hasAttribute('data-sk-panel-voz')) panelVoz.setAttribute('data-sk-panel-voz', '');
			if (panelVoz && raizPaneles) {
				const l = panelVoz.style.left || '0%';
				const w = panelVoz.style.width || '100%';
				if (raizPaneles.style.getPropertyValue('--sk-voz-l') !== l) raizPaneles.style.setProperty('--sk-voz-l', l);
				if (raizPaneles.style.getPropertyValue('--sk-voz-w') !== w) raizPaneles.style.setProperty('--sk-voz-w', w);
				// chat y voz en la misma columna (mismo grupo de pestañas): se muestran juntos aunque toques el chat y
				// Open WebUI active su pestaña; con la voz en la otra columna de la vista dividida no hace falta
				const junto = (panelChat.style.left || '0%') === l && (panelChat.style.width || '100%') === w;
				if (raizPaneles.hasAttribute('data-sk-voz-junto') !== junto) raizPaneles.toggleAttribute('data-sk-voz-junto', junto);
			}

			// la pestaña del modo voz lleva el subrayado del color del modelo
			const panel = boton.closest('[role="tabpanel"]');
			const pestana = panel?.id && document.querySelector(`[aria-controls="${panel.id}"]`);
			const tab = pestana?.closest('.panel-tab') ?? pestana;
			if (tab && !tab.classList.contains('sk-pestana-voz')) {
				document.querySelectorAll('.sk-pestana-voz').forEach((t) => t.classList.remove('sk-pestana-voz'));
				tab.classList.add('sk-pestana-voz');
			}
		});
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class', 'style', 'aria-label'] });
})();

/*
 * Modo voz: botón "Razonar" (rosa, con el nivel en una etiqueta) entre Cámara y Silenciar, y hoja inferior para elegir
 * el nivel (lienzo "Azul/negro · 6 Razonamiento"). El nivel se cambia con el mismo control de Razonamiento del chat
 * (el menú se abre invisible y se toca el nivel), así que se guarda igual. Sin un modelo que razone no aparece.
 */
(() => {
	const NIVELES = [
		['apagado', 'Apagado', 'Responde al instante, sin pensar antes'],
		['bajo', 'Bajo', 'Piensa un poco; casi igual de rápido'],
		['medio', 'Medio', 'Equilibrio entre rapidez y cuidado'],
		['alto', 'Alto', 'Piensa más a fondo; tarda un poco más'],
		['adaptable', 'Adaptable', 'Decide cuánto pensar según la pregunta']
	];
	const ICONO =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>';
	const CERRAR =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
	let pendiente = false;

	const chip = () => document.querySelector('button.sk-razonamiento');
	const nombreNivel = (clave) => NIVELES.find(([c]) => c === clave)?.[1] ?? (clave ? clave[0].toUpperCase() + clave.slice(1) : '');

	const elegir = async (clave) => {
		const c = chip();
		if (!c) return;
		document.documentElement.classList.add('sk-encendiendo');
		c.click();
		for (let i = 0; i < 30; i++) {
			await new Promise((r) => setTimeout(r, 50));
			// por posición (Apagado · Bajo · Medio · Alto · Adaptable): el nombre puede cambiar ("Apagado / Modo Voz")
			const indice = NIVELES.findIndex(([c]) => c === clave);
			const boton = document.querySelectorAll('.sk-menu-razonamiento .sk-niveles button')[indice];
			if (boton) {
				boton.click();
				break;
			}
		}
		// se cierra volviendo a tocar el chip: con Esc también se cerraba el modo voz
		await new Promise((r) => setTimeout(r, 80));
		if (document.querySelector('.sk-menu-razonamiento')) c.click();
		setTimeout(() => document.documentElement.classList.remove('sk-encendiendo'), 250);
	};

	const cerrarHoja = () => {
		document.querySelector('.sk-voz-hoja')?.remove();
		document.querySelector('.sk-voz-velo')?.remove();
	};

	// la hoja va dentro del propio modo voz (en el teléfono vive en el cajón de pestañas, encima de todo; fuera de él
	// quedaba por debajo y no se veía)
	const abrirHoja = (raiz) => {
		cerrarHoja();
		const c = chip();
		if (!c) return;
		const actual = c.dataset.skNivel || '';
		const modelo = document.querySelector('#model-selector-model-button')?.textContent.trim() || 'el modelo';
		if (getComputedStyle(raiz).position === 'static') raiz.classList.add('sk-voz-raiz');
		const velo = document.createElement('div');
		velo.className = 'sk-voz-velo';
		velo.addEventListener('click', cerrarHoja);
		const hoja = document.createElement('div');
		hoja.className = 'sk-voz-hoja';
		hoja.setAttribute('role', 'dialog');
		hoja.setAttribute('aria-label', 'Razonamiento');
		hoja.innerHTML = `
			<span class="sk-voz-hoja-asa" aria-hidden="true"></span>
			<div class="sk-voz-hoja-cabeza">
				<span class="sk-voz-hoja-insignia">${ICONO}</span>
				<span class="sk-voz-hoja-titulos"><b>Razonamiento</b><span>Cuánto piensa ${modelo} antes de hablar</span></span>
				<button type="button" class="sk-voz-hoja-cerrar" aria-label="Cerrar">${CERRAR}</button>
			</div>
			<div role="radiogroup" aria-label="Nivel de razonamiento">
				${NIVELES.map(
					([clave, nombre, nota]) => `<button type="button" role="radio" data-nivel="${clave}" aria-checked="${clave === actual}">
						<span class="sk-voz-hoja-radio" aria-hidden="true"></span>
						<span class="sk-voz-hoja-textos"><b>${nombre}</b><span>${nota}</span></span>
					</button>`
				).join('')}
			</div>`;
		hoja.querySelector('.sk-voz-hoja-cerrar').addEventListener('click', cerrarHoja);
		hoja.querySelectorAll('[role="radio"]').forEach((b) =>
			b.addEventListener('click', async () => {
				hoja.querySelectorAll('[role="radio"]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
				await elegir(b.dataset.nivel);
				setTimeout(cerrarHoja, 180);
			})
		);
		raiz.append(velo, hoja);
		hoja.querySelector('[aria-checked="true"]')?.focus();
	};

	const actualizar = () => {
		pendiente = false;
		// el modo voz que está a la vista: su píldora de estado y, justo después, su fila de botones
		const avatar = [...document.querySelectorAll('button.sk-voz-boton')].find((b) => b.getClientRects().length);
		const raiz = avatar?.closest('.max-w-lg') ?? avatar?.closest('.flex-col')?.parentElement;
		const estado = raiz?.querySelector("[role='status'][aria-live]");
		const fila = estado?.nextElementSibling;
		const c = chip();
		document.querySelectorAll('.sk-voz-razonar').forEach((b) => {
			if (b.parentElement !== fila) b.remove();
		});
		let boton = fila?.querySelector(':scope > .sk-voz-razonar');
		if (!fila || !c) {
			boton?.remove();
			if (!avatar) cerrarHoja();
			return;
		}
		if (!boton) {
			boton = document.createElement('button');
			boton.type = 'button';
			boton.className = 'rounded-full sk-voz-razonar';
			boton.setAttribute('aria-label', 'Razonar');
			boton.innerHTML = `${ICONO}<span class="sk-voz-razonar-nivel"></span>`;
			boton.addEventListener('click', () => {
				const voz = [...document.querySelectorAll('button.sk-voz-boton')].find((b) => b.getClientRects().length);
				abrirHoja(voz?.closest('.max-w-lg')?.parentElement ?? voz?.closest('.max-w-lg') ?? document.body);
			});
		}
		// siempre entre Cámara y Silenciar: Open WebUI arma la fila por partes, así que se reacomoda en cada cambio
		const arriba = (b) => {
			while (b && b.parentElement !== fila) b = b.parentElement;
			return b;
		};
		const botones = [...fila.querySelectorAll('button[aria-label]')].filter((b) => b !== boton);
		const camara = arriba(botones.find((b) => /camera|c[aá]mara/i.test(b.getAttribute('aria-label'))));
		const mute = arriba(botones.find((b) => /^(un)?mute$|silenc|activar mic/i.test(b.getAttribute('aria-label'))));
		if (camara) {
			if (camara.nextElementSibling !== boton) camara.after(boton);
		} else if (mute) {
			if (boton.nextElementSibling !== mute) fila.insertBefore(boton, mute);
		} else if (boton.parentElement !== fila) fila.prepend(boton);
		const clave = c.dataset.skNivel || '';
		const texto = nombreNivel(clave);
		const etiqueta = boton.querySelector('.sk-voz-razonar-nivel');
		if (etiqueta.textContent !== texto) etiqueta.textContent = texto;
		const apagado = clave === 'apagado';
		if (boton.classList.contains('sk-apagada') !== apagado) boton.classList.toggle('sk-apagada', apagado);
		const hoja = document.querySelector('.sk-voz-hoja');
		hoja?.querySelectorAll('[role="radio"]').forEach((x) => {
			const marcado = String(x.dataset.nivel === clave);
			if (x.getAttribute('aria-checked') !== marcado && !hoja.dataset.eligiendo) x.setAttribute('aria-checked', marcado);
		});
	};

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape' && document.querySelector('.sk-voz-hoja') && !document.documentElement.classList.contains('sk-encendiendo')) cerrarHoja();
	});

	/*
	 * Al iniciar el modo voz el razonamiento pasa a Apagado (responde sin pensar antes) y al salir vuelve al nivel que
	 * tenías. El nivel anterior se guarda en el navegador, así que también vuelve si la página se recarga a media llamada.
	 */
	const CLAVE_PREVIO = 'sk-voz-nivel-previo';
	let enVoz = false;
	let ocupado = false;
	const modeloActual = () => document.querySelector('#model-selector-model-button')?.textContent.trim() || '';
	const leerPrevio = () => {
		try {
			return JSON.parse(localStorage.getItem(CLAVE_PREVIO) || 'null');
		} catch {
			return null;
		}
	};
	const guardarPrevio = (valor) => {
		try {
			if (valor) localStorage.setItem(CLAVE_PREVIO, JSON.stringify(valor));
			else localStorage.removeItem(CLAVE_PREVIO);
		} catch {
			// sin localStorage: solo dura mientras la página siga abierta
		}
	};
	const vigilarVoz = async () => {
		if (ocupado) return;
		const activo = Boolean(document.querySelector('button.sk-voz-boton'));
		const c = chip();
		if (!c) return; // el modelo aún no carga sus niveles: se intenta en el siguiente cambio
		const nivel = c.dataset.skNivel || '';
		ocupado = true;
		try {
			if (activo && !enVoz) {
				enVoz = true;
				if (!leerPrevio() && nivel && nivel !== 'apagado') {
					guardarPrevio({ nivel, modelo: modeloActual() });
					await elegir('apagado');
				}
			} else if (!activo) {
				enVoz = false;
				const previo = leerPrevio();
				if (previo) {
					guardarPrevio(null);
					if (previo.modelo === modeloActual() && nivel !== previo.nivel) await elegir(previo.nivel);
				}
			}
		} finally {
			ocupado = false;
		}
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(() => {
			actualizar();
			vigilarVoz();
		});
	}, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-sk-nivel', 'data-sk-voz'] });
})();

/*
 * Pestaña Navegador (lienzo "Escritorio · Pestaña Navegador rediseñada"): marca las piezas del panel para el CSS
 * (.sk-navegador, .sk-nav-*) y agrega a la tarjeta vacía el campo "Escribe una dirección o busca", que escribe en la
 * barra de dirección de Open WebUI y la envía. Una búsqueda (texto sin forma de dirección) se abre en DuckDuckGo.
 */
(() => {
	const LUPA =
		'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
	let pendiente = false;
	const marcar = (el, clase) => {
		if (el && !el.classList.contains(clase)) el.classList.add(clase);
	};

	const direccion = (texto) => {
		const t = texto.trim();
		if (!t) return '';
		if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return t;
		if (/^(localhost|127\.0\.0\.1|\[::1\]|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/.*)?$/i.test(t) || /^:\d+/.test(t))
			return `http://${t.startsWith(':') ? `localhost${t}` : t}`;
		if (!/\s/.test(t) && /^[^/]+\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(t)) return `https://${t}`;
		return `https://duckduckgo.com/?q=${encodeURIComponent(t)}`;
	};

	const abrir = (barraInput, texto) => {
		const url = direccion(texto);
		if (!url) return;
		const asignar = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
		asignar.call(barraInput, url);
		barraInput.dispatchEvent(new Event('input', { bubbles: true }));
		barraInput.form?.requestSubmit();
	};

	const campo = (barraInput) => {
		const ir = document.createElement('form');
		ir.className = 'sk-nav-ir';
		ir.innerHTML = `${LUPA}<input type="text" placeholder="Escribe una dirección o busca" aria-label="Dirección o búsqueda" autocomplete="off" spellcheck="false"><button type="submit" disabled>Abrir</button>`;
		const entrada = ir.querySelector('input');
		const boton = ir.querySelector('button');
		entrada.addEventListener('input', () => (boton.disabled = !entrada.value.trim()));
		ir.addEventListener('submit', (e) => {
			e.preventDefault();
			abrir(barraInput, entrada.value);
		});
		return ir;
	};

	const actualizar = () => {
		pendiente = false;
		document.querySelectorAll("input[aria-label='URL']").forEach((inp) => {
			const form = inp.closest('form');
			const barra = form?.parentElement;
			const panel = barra?.closest('[role="tabpanel"]');
			if (!panel) return;
			marcar(panel, 'sk-navegador');
			marcar(barra, 'sk-nav-barra');
			marcar(form, 'sk-nav-url');
			if (inp.placeholder !== 'Nueva pestaña') inp.placeholder = 'Nueva pestaña';
			// sin página abierta Open WebUI titula la pestaña "Browser" (sin traducir)
			const titulo = panel.id && document.querySelector(`[aria-controls="${panel.id}"] span.text-ellipsis`);
			if (titulo?.textContent === 'Browser') titulo.textContent = 'Navegador';

			const tarjeta = panel.querySelector('div.m-auto.max-w-xs');
			if (!tarjeta) return;
			marcar(tarjeta, 'sk-nav-tarjeta');
			const cabeza = tarjeta.firstElementChild;
			marcar(cabeza, 'sk-nav-cabeza');
			if (cabeza && !tarjeta.querySelector(':scope > .sk-nav-ir')) cabeza.after(campo(inp));

			const puertos = tarjeta.querySelector(':scope > .mt-3');
			marcar(puertos, 'sk-nav-puertos');
			const cabezaPuertos = puertos?.querySelector('div.h-7');
			marcar(cabezaPuertos, 'sk-nav-puertos-cabeza');
			marcar(cabezaPuertos?.querySelector(':scope > span button'), 'sk-nav-rebuscar');
			marcar(puertos?.querySelector('div.text-xs.py-2'), 'sk-nav-vacio');
			puertos?.querySelectorAll('div.h-8.group').forEach((fila) => marcar(fila, 'sk-nav-puerto'));
		});
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true });
	actualizar();
})();

/*
 * Generación de imagen en el chat (lienzo "Generación de imagen en el chat · escritorio y móvil" y "· móvil").
 * Mientras la herramienta generate_image/edit_image corre ("Explorando generate_image"), debajo aparece una tarjeta con
 * los pasos Cargando modelo → Generando → Lista, un lienzo con brillo y Cancelar. El lanzador
 * (run_open_webui_https.py) dice en qué va ComfyUI en /static/sakura-imagen.json: si está cargando el modelo, o el paso
 * n de m (se ve el % y "Paso 6 de 8"). Sin ese dato la tarjeta muestra "Generando imagen…" con una barra que corre.
 * Al terminar, cada imagen generada queda en un marco de esquinas de 20 px con sombra, Ampliar arriba a la derecha,
 * en una tarjeta blanca con la barra unida abajo: "1024×1024 · modelo" (con "‹ n / m ›" delante si la respuesta se
 * regeneró) y los botones redondos Descargar, Copiar, Variaciones y Regenerar; "Prompt usado" debajo de la tarjeta.
 * Varias imágenes en un mensaje van en cuadrícula de 2×2 dentro de la tarjeta; mientras se generan las variaciones se
 * ven las listas, la que se genera con su % y las que esperan "En cola".
 */
(() => {
	const HERRAMIENTA = /\b(generate_image|edit_image)\b/;
	// mientras corre: "Ejecutando generate_image…" (herramienta sola) o "Explorando generate_image" (varias juntas);
	// al terminar: "Ver el Resultado de…" / "Explorado…"
	const CORRIENDO = /\b(Ejecutando|Explorando|Running|Exploring)\b/;
	const TERMINADA = /\b(Ver el Resultado|View Result|Explorado|Explored)\b/;
	const ICONOS = {
		ampliar: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
		descargar: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
		copiar: '<path d="M8 8h12v12H8zM16 8V4H4v12h4"/>',
		variaciones: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
		anterior: '<path d="M15 6l-6 6 6 6"/>',
		siguiente: '<path d="M9 6l6 6-6 6"/>',
		regenerar: '<path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5"/>',
		listo: '<path d="M5 12l5 5 9-10"/>'
	};
	const svg = (nombre) =>
		`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONOS[nombre]}</svg>`;

	let pendiente = false;
	let estado = null; // último /static/sakura-imagen.json
	let sondeo = null;
	let sinServidor = false;

	const autorizacion = () => ({ Authorization: `Bearer ${localStorage.token || ''}` });

	const consultar = async () => {
		if (sinServidor) return;
		try {
			const r = await fetch('/static/sakura-imagen.json', { headers: autorizacion(), cache: 'no-store' });
			if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) {
				sinServidor = true;
				return;
			}
			estado = await r.json();
		} catch {
			// sin conexión: se intenta en la siguiente vuelta
		}
	};

	const modeloCorto = (nombre) =>
		String(nombre || '')
			.split(/[\\/]/)
			.pop()
			.replace(/\.(gguf|safetensors|ckpt|pt|bin)$/i, '')
			.replace(/[-_.](Q\d\w*|fp\d+|bf16|f16)$/i, '')
			// nombre corto como en el lienzo ("FLUX"): las dos primeras partes, "z-image-turbo" → "z-image"
			.split(/[-_]/)
			.slice(0, 2)
			.join('-');

	/* ---------- tarjeta mientras se genera (lienzo: tarjeta blanca con barra unida abajo) ---------- */
	const cancelar = async (e) => {
		const b = e.currentTarget;
		b.disabled = true;
		b.textContent = 'Cancelando…';
		try {
			await fetch('/static/sakura-imagen-cancelar', { method: 'POST', headers: autorizacion() });
		} catch {
			// si falla, el botón vuelve
		}
		setTimeout(() => {
			b.disabled = false;
			b.textContent = 'Cancelar';
		}, 4000);
	};

	// una imagen: lienzo con brillo y barra "Cargando modelo · 1 de 2" / "Generando · 2 de 2" con Cancelar
	const tarjeta = () => {
		const t = document.createElement('div');
		t.className = 'sk-img-gen';
		t.innerHTML = `
			<div class="sk-img-lienzo" role="status" aria-live="polite">
				<span class="sk-img-giro" aria-hidden="true"></span>
				<strong class="sk-img-titulo"></strong>
				<div class="sk-img-barra" aria-hidden="true"><i></i></div>
				<small class="sk-img-nota"></small>
			</div>
			<div class="sk-img-barra-pie">
				<span class="sk-img-progreso"><span class="sk-img-segmentos" aria-hidden="true"><i></i><i></i></span><b class="sk-img-fase"></b><span class="sk-img-de"></span></span>
				<button type="button" class="sk-img-cancelar">Cancelar</button>
			</div>`;
		t.querySelector('.sk-img-cancelar').addEventListener('click', cancelar);
		return t;
	};

	// variaciones: cuadrícula de 2×2 dentro de la tarjeta; las listas con su imagen, la que se genera con su %, las
	// demás "En cola"; abajo "1 de 4 listas" con un segmento por variación y Cancelar
	const tarjetaVariaciones = () => {
		const t = document.createElement('div');
		t.className = 'sk-img-gen sk-img-gen-var';
		t.innerHTML = `
			<div class="sk-img-rejilla-carga" role="status" aria-live="polite"></div>
			<div class="sk-img-barra-pie">
				<span class="sk-img-progreso"><span class="sk-img-segmentos" aria-hidden="true"></span><b class="sk-img-fase"></b></span>
				<button type="button" class="sk-img-cancelar">Cancelar</button>
			</div>`;
		t.querySelector('.sk-img-cancelar').addEventListener('click', cancelar);
		return t;
	};

	const leerEstado = () => {
		const reciente = estado && estado.inicio && estado.ahora - estado.inicio < 900;
		if (reciente && estado.estado === 'iniciando') return { fase: 'cargando', titulo: 'Preparando…', nota: 'Enviando a ComfyUI', etiqueta: 'Preparando' };
		if (reciente && estado.estado === 'cargando') return { fase: 'cargando', titulo: 'Cargando modelo…', nota: 'Solo pasa la primera vez', etiqueta: 'Cargando modelo' };
		if (reciente && estado.estado === 'generando' && estado.pasos > 0) {
			const pct = Math.min(100, Math.round((estado.paso / estado.pasos) * 100));
			return { fase: 'generando', pct, nota: `Paso ${estado.paso} de ${estado.pasos}`, etiqueta: 'Generando' };
		}
		if (reciente && estado.estado === 'cancelada') return { fase: 'generando', titulo: 'Cancelando…', nota: 'Se detiene en un momento', etiqueta: 'Cancelando' };
		return { fase: 'generando', titulo: 'Generando imagen…', nota: 'Puede tardar unos segundos', etiqueta: 'Generando' };
	};

	const pintar = (t) => {
		if (t.classList.contains('sk-img-gen-var')) return pintarVariaciones(t);
		const e = leerEstado();
		if (t.dataset.fase !== e.fase) t.dataset.fase = e.fase;
		const conPct = e.pct != null;
		if (t.classList.contains('sk-img-con-pct') !== conPct) t.classList.toggle('sk-img-con-pct', conPct);
		const tit = t.querySelector('.sk-img-titulo');
		const html = conPct ? `${e.pct}<small>%</small>` : e.titulo;
		if (tit.innerHTML !== html) tit.innerHTML = html;
		const n = t.querySelector('.sk-img-nota');
		if (n.textContent !== e.nota) n.textContent = e.nota;
		const barra = t.querySelector('.sk-img-barra > i');
		const ancho = conPct ? `${e.pct}%` : '';
		if (barra.style.width !== ancho) barra.style.width = ancho;
		const fase = t.querySelector('.sk-img-fase');
		if (fase.textContent !== e.etiqueta) fase.textContent = e.etiqueta;
		const de = t.querySelector('.sk-img-de');
		const texto = e.fase === 'cargando' ? '· 1 de 2' : '· 2 de 2';
		if (de.textContent !== texto) de.textContent = texto;
	};

	const ICONO_COLA = '<path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>';
	const pintarVariaciones = (t) => {
		const listas = t._listas || [];
		const total = Math.max(4, listas.length + 1);
		const e = leerEstado();
		const actual = listas.length;
		const firma = `${listas.map((i) => i.src).join('|')}#${total}#${e.fase}#${e.pct ?? ''}#${e.titulo ?? ''}`;
		if (t.dataset.firma === firma) return;
		t.dataset.firma = firma;
		const celdas = [];
		for (let n = 0; n < total; n++) {
			if (n < actual) {
				celdas.push(`<div class="sk-img-celda-carga sk-lista"><img alt="Variación ${n + 1}" src="${listas[n].src}"><span class="sk-img-num">${n + 1}</span></div>`);
			} else if (n === actual) {
				const centro =
					e.pct != null
						? `<strong>${e.pct}<small>%</small></strong><span class="sk-img-mini-barra"><i style="width:${e.pct}%"></i></span><em>Generando</em>`
						: e.fase === 'cargando'
							? `<span class="sk-img-giro" aria-hidden="true"></span><em>${e.etiqueta}</em>`
							: `<span class="sk-img-mini-barra sk-corre"><i></i></span><em>${e.etiqueta}</em>`;
				celdas.push(`<div class="sk-img-celda-carga sk-generando"><span class="sk-img-num">${n + 1}</span>${centro}</div>`);
			} else {
				celdas.push(`<div class="sk-img-celda-carga sk-en-cola"><span class="sk-img-num">${n + 1}</span>${svgCrudo(ICONO_COLA)}<em>En cola</em></div>`);
			}
		}
		t.querySelector('.sk-img-rejilla-carga').innerHTML = celdas.join('');
		t.querySelector('.sk-img-segmentos').innerHTML = Array.from({ length: total }, (_, n) =>
			`<i class="${n < actual ? 'sk-hecho' : n === actual ? 'sk-actual' : ''}"></i>`
		).join('');
		escribir(t.querySelector('.sk-img-fase'), `${actual} de ${total} listas`);
	};

	const svgCrudo = (d) =>
		`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

	/* ---------- imagen terminada ---------- */
	const promptDe = async (mensajeId) => {
		const chatId = (location.pathname.match(/\/c\/([^/?#]+)/) || [])[1];
		if (!chatId || !mensajeId) return '';
		const r = await fetch(`/api/v1/chats/${chatId}`, { headers: autorizacion() });
		if (!r.ok) return '';
		const chat = await r.json();
		const m = chat?.chat?.history?.messages?.[mensajeId];
		const llamadas = (m?.output || []).filter((o) => o?.type === 'function_call' && HERRAMIENTA.test(o.name || ''));
		for (const l of llamadas.reverse()) {
			try {
				const args = JSON.parse(l.arguments || '{}');
				if (args.prompt) return String(args.prompt);
			} catch {
				// argumentos que no son JSON
			}
		}
		return '';
	};

	const copiar = async (img, boton) => {
		try {
			const blob = await (await fetch(img.src)).blob();
			const png = blob.type === 'image/png' ? blob : await new Promise((ok) => {
				const c = document.createElement('canvas');
				c.width = img.naturalWidth;
				c.height = img.naturalHeight;
				c.getContext('2d').drawImage(img, 0, 0);
				c.toBlob(ok, 'image/png');
			});
			await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
			boton.innerHTML = svg('listo');
			boton.setAttribute('aria-label', 'Imagen copiada');
			boton.title = 'Imagen copiada';
		} catch {
			boton.classList.add('sk-img-fallo');
			boton.setAttribute('aria-label', 'No se pudo copiar');
			boton.title = 'No se pudo copiar';
		}
		setTimeout(() => {
			boton.innerHTML = svg('copiar');
			boton.classList.remove('sk-img-fallo');
			boton.setAttribute('aria-label', 'Copiar');
			boton.title = 'Copiar';
		}, 1500);
	};

	// Variaciones (lienzo "resultado de Variaciones"): pide 4 versiones distintas con el mismo prompt. Escribe la
	// petición con el prompt de la imagen y la envía; el mensaje del usuario se ve como el chip "Pediste variaciones".
	const PEDIDO = 'Genera 4 variaciones distintas de esta imagen con el mismo prompt';
	const variaciones = async (mensaje) => {
		const prompt = await promptDe(mensaje?.id.replace(/^message-/, '')).catch(() => '');
		const caja = document.querySelector('#chat-input');
		if (!caja) return;
		caja.focus();
		document.execCommand('insertText', false, prompt ? `${PEDIDO}: «${prompt}»` : `${PEDIDO}.`);
		for (let i = 0; i < 20; i++) {
			await new Promise((r) => setTimeout(r, 50));
			const enviar = document.querySelector('#send-message-button:not([disabled])');
			if (enviar) {
				enviar.click();
				return;
			}
		}
	};

	// Regenerar: el botón de Open WebUI abre un menú (Prueba de nuevo · Añadir detalles · Más conciso); se elige
	// "Prueba de nuevo", que hace otra respuesta y deja la anterior en el historial ("‹ 1 / 2 ›")
	const regenerar = async (mensaje) => {
		const boton = mensaje?.querySelector("button[aria-label='Regenerar'], button[aria-label='Regenerate']");
		if (!boton) return;
		document.documentElement.classList.add('sk-img-regenerando');
		try {
			boton.click();
			for (let i = 0; i < 25; i++) {
				await new Promise((r) => setTimeout(r, 40));
				const opcion = [...document.querySelectorAll('[role="menu"] button, [role="menuitem"]')].find((b) =>
					/^(Prueba de nuevo|Intentar de nuevo|Try again)$/i.test(b.textContent.trim())
				);
				if (opcion) {
					opcion.click();
					return;
				}
			}
		} finally {
			setTimeout(() => document.documentElement.classList.remove('sk-img-regenerando'), 150);
		}
	};

	// versión que se ve de la respuesta ("2/2" de Open WebUI, entre sus botones anterior y siguiente)
	const versiones = (mensaje) => {
		const m = mensaje?.querySelector('.previous-message-button')?.parentElement?.textContent.match(/(\d+)\s*\/\s*(\d+)/);
		return m ? [Number(m[1]), Number(m[2])] : null;
	};

	// pie: "Lista · 1024×1024 · modelo" con "‹ n / m ›" a la derecha; debajo Descargar y Copiar redondos, una raya y
	// las píldoras Variaciones y Regenerar; al final "Prompt usado". actual() da la imagen sobre la que actúan.
	const crearPie = (mensaje, actual) => {
		const pie = document.createElement('div');
		pie.className = 'sk-img-pie';
		pie.innerHTML = `
			<div class="sk-img-fila">
				<span class="sk-img-meta" aria-live="polite">
					<span class="sk-img-version" hidden>
						<button type="button" data-accion="anterior" aria-label="Versión anterior" title="Versión anterior">${svg('anterior')}</button>
						<span class="sk-img-cuenta"></span>
						<button type="button" data-accion="siguiente" aria-label="Versión siguiente" title="Versión siguiente">${svg('siguiente')}</button>
					</span>
					<span class="sk-img-datos"></span>
				</span>
				<a class="sk-img-btn" aria-label="Descargar" title="Descargar" download="sakura-imagen.png">${svg('descargar')}</a>
				<button type="button" class="sk-img-btn" data-accion="copiar" aria-label="Copiar" title="Copiar">${svg('copiar')}</button>
				<button type="button" class="sk-img-btn" data-accion="variaciones" aria-label="Variaciones · crea 4 versiones con el mismo prompt" title="Variaciones · crea 4 versiones con el mismo prompt">${svg('variaciones')}</button>
				<button type="button" class="sk-img-btn" data-accion="regenerar" aria-label="Regenerar · reemplaza la imagen; la anterior queda en el historial" title="Regenerar · reemplaza la imagen; la anterior queda en el historial">${svg('regenerar')}</button>
			</div>
			<details class="sk-img-prompt"><summary>Prompt usado</summary><div>Cargando…</div></details>`;
		const descargar = pie.querySelector('a');
		descargar.href = actual()?.src || '';
		// nombre de archivo propio por imagen (no todas "sakura-imagen.png")
		descargar.addEventListener('click', () => {
			const img = actual();
			descargar.href = img?.src || '';
			const n = img?.closest('.sk-img-escondida') ? `-${(mensaje?.querySelector('.sk-img-variaciones')?._imgs || []).indexOf(img) + 1}` : '';
			descargar.download = `sakura-imagen-${(mensaje?.id || '').replace(/^message-/, '').slice(0, 8)}${n}.png`;
		});
		pie.addEventListener('click', (e) => {
			const b = e.target.closest('button[data-accion]');
			if (!b) return;
			const accion = b.dataset.accion;
			if (accion === 'copiar') copiar(actual(), b);
			else if (accion === 'variaciones') variaciones(mensaje);
			else if (accion === 'regenerar') regenerar(mensaje);
			else mensaje?.querySelector(accion === 'anterior' ? '.previous-message-button' : '.next-message-button')?.click();
		});
		const detalles = pie.querySelector('details');
		detalles.addEventListener('toggle', async () => {
			if (!detalles.open || detalles.dataset.cargado) return;
			detalles.dataset.cargado = '1';
			const texto = await promptDe(mensaje?.id.replace(/^message-/, '')).catch(() => '');
			detalles.querySelector('div').textContent = texto || 'No se encontró el prompt de esta imagen.';
		});
		return pie;
	};

	const escribir = (el, texto) => {
		if (el && el.textContent !== texto) el.textContent = texto;
	};

	const pintarVersion = (pie, v) => {
		const caja = pie.querySelector('.sk-img-version');
		const ocultar = !v || v[1] < 2;
		if (caja.hidden !== ocultar) caja.hidden = ocultar;
		if (ocultar) return;
		escribir(caja.querySelector('.sk-img-cuenta'), `${v[0]} / ${v[1]}`);
		const ant = caja.querySelector('[data-accion="anterior"]');
		const sig = caja.querySelector('[data-accion="siguiente"]');
		if (ant.disabled !== v[0] <= 1) ant.disabled = v[0] <= 1;
		if (sig.disabled !== v[0] >= v[1]) sig.disabled = v[0] >= v[1];
	};

	// una imagen: marco de 20 px, Ampliar y el pie
	// proporción de la imagen (ancho / alto) en su contenedor: el CSS calcula con ella el ancho para que una imagen
	// vertical no pase del alto de la ventana y la imagen se vea completa, sin recortes
	const proporcionar = (el, img) => {
		if (!img?.naturalWidth) return;
		const r = (img.naturalWidth / img.naturalHeight).toFixed(4);
		if (el.style.getPropertyValue('--sk-img-r') !== r) {
			el.style.setProperty('--sk-img-r', r);
			el.style.setProperty('--sk-img-proporcion', `${img.naturalWidth} / ${img.naturalHeight}`);
		}
	};

	const decorar = (img, mensaje, v) => {
		const grupo = img.closest('.group');
		const envoltura = grupo?.parentElement;
		if (!grupo || !envoltura) return;
		envoltura.classList.remove('sk-img-escondida');
		let pie = envoltura.querySelector(':scope > .sk-img-pie');
		if (!pie) {
			grupo.classList.add('sk-img-marco');
			envoltura.classList.add('sk-img-hecha');
			if (!grupo.querySelector(':scope > .sk-img-ampliar')) {
				const ampliar = document.createElement('button');
				ampliar.type = 'button';
				ampliar.className = 'sk-img-ampliar';
				ampliar.setAttribute('aria-label', 'Ampliar');
				ampliar.innerHTML = svg('ampliar');
				ampliar.addEventListener('click', (e) => {
					e.stopPropagation();
					grupo.querySelector('button')?.click();
				});
				grupo.appendChild(ampliar);
			}
			// el botón de Open WebUI que abre la vista previa no tenía nombre para lectores de pantalla
			grupo.querySelector('button:not(.sk-img-ampliar)')?.setAttribute('aria-label', 'Ver la imagen en grande');
			pie = crearPie(mensaje, () => img);
			envoltura.appendChild(pie);
		}
		// tamaño y modelo (se vuelve a escribir si Open WebUI cambia la imagen al pasar de versión)
		if (img.naturalWidth) {
			// la proporción real queda reservada para que al cambiar de versión el pie no salte
			const proporcion = `${img.naturalWidth} / ${img.naturalHeight}`;
			proporcionar(envoltura, img);
			const tam = `${img.naturalWidth}×${img.naturalHeight}`;
			const d = pie.querySelector('.sk-img-datos');
			if (d.dataset.tam !== tam) {
				d.dataset.tam = tam;
				d.textContent = tam;
				const modelo = modeloCorto(estado?.modelo);
				if (modelo) {
					const m = document.createElement('span');
					m.className = 'sk-img-modelo';
					m.textContent = ` · ${modelo}`;
					d.appendChild(m);
				}
			}
		}
		pintarVersion(pie, v);
	};

	// varias imágenes en un mensaje (Variaciones): cuadrícula de 2×2 con número; tocar una la elige (aro azul y
	// palomita) y tocar la elegida la abre grande. El pie actúa sobre la elegida.
	const cuadricula = (imgs, mensaje, v) => {
		const envolturas = imgs.map((i) => i.closest('.group')?.parentElement).filter(Boolean);
		if (!envolturas.length) return;
		envolturas.forEach((e) => {
			e.querySelector(':scope > .sk-img-pie')?.remove();
			if (!e.classList.contains('sk-img-escondida')) e.classList.add('sk-img-escondida');
		});
		let caja = mensaje.querySelector('.sk-img-variaciones');
		if (!caja) {
			caja = document.createElement('div');
			caja.className = 'sk-img-variaciones';
			caja.dataset.sel = '0';
			caja.innerHTML = '<div class="sk-img-rejilla" role="group" aria-label="Variaciones"></div>';
			const elegida = () => caja._imgs?.[Number(caja.dataset.sel)] ?? caja._imgs?.[0];
			caja.appendChild(crearPie(mensaje, elegida));
			caja.querySelector('.sk-img-rejilla').addEventListener('click', (e) => {
				const celda = e.target.closest('.sk-img-celda');
				if (!celda) return;
				const n = Number(celda.dataset.n);
				if (n === Number(caja.dataset.sel)) caja._imgs?.[n]?.closest('.group')?.querySelector('button')?.click();
				else {
					caja.dataset.sel = String(n);
					pintarSeleccion(caja);
				}
			});
			envolturas[0].before(caja);
		}
		caja._imgs = imgs;
		proporcionar(caja, imgs[0]);
		const firma = imgs.map((i) => i.src).join('|');
		if (caja.dataset.firma !== firma) {
			caja.dataset.firma = firma;
			if (Number(caja.dataset.sel) >= imgs.length) caja.dataset.sel = '0';
			const rejilla = caja.querySelector('.sk-img-rejilla');
			rejilla.replaceChildren(
				...imgs.map((original, n) => {
					const celda = document.createElement('button');
					celda.type = 'button';
					celda.className = 'sk-img-celda';
					celda.dataset.n = String(n);
					const foto = document.createElement('img');
					foto.alt = `Variación ${n + 1}`;
					foto.src = original.src;
					const num = document.createElement('span');
					num.className = 'sk-img-num';
					celda.append(foto, num);
					return celda;
				})
			);
			pintarSeleccion(caja);
		}
		pintarVersion(caja.querySelector('.sk-img-pie'), v);
	};

	const pintarSeleccion = (caja) => {
		const sel = Number(caja.dataset.sel);
		caja.querySelectorAll('.sk-img-celda').forEach((celda, n) => {
			const elegida = n === sel;
			celda.setAttribute('aria-pressed', String(elegida));
			celda.title = elegida ? 'Abrir en grande' : `Elegir la variación ${n + 1}`;
			celda.querySelector('.sk-img-num').innerHTML = elegida ? svg('listo') : String(n + 1);
		});
		const img = caja._imgs[sel];
		const tam = img?.naturalWidth ? ` · ${img.naturalWidth}×${img.naturalHeight}` : '';
		escribir(caja.querySelector('.sk-img-datos'), `Variación ${sel + 1} de ${caja._imgs.length}${tam}`);
	};

	// chips del usuario: "Pediste variaciones de la imagen" en lugar del texto de la petición, y "Regeneraste la imagen"
	// debajo del mensaje cuya respuesta que se ve es una regeneración (versión 2 o más)
	const chip = (tipo) => {
		const c = document.createElement('span');
		c.className = 'sk-img-chip';
		c.dataset.tipo = tipo;
		c.innerHTML = `<img alt="">${svg(tipo === 'pedido' ? 'variaciones' : 'regenerar')}${tipo === 'pedido' ? 'Pediste variaciones de la imagen' : 'Regeneraste la imagen'}`;
		return c;
	};

	const ponerMiniatura = (c, src) => {
		const i = c.querySelector('img');
		if (src && i.getAttribute('src') !== src) i.src = src;
	};

	const chips = (regeneradas) => {
		let ultima = null;
		let usuario = null;
		const quiere = new Map(); // mensaje del usuario → ['pedido' | 'regenerada', miniatura]
		document.querySelectorAll(".user-message, .chat-assistant img[alt='generated-image.png']").forEach((el) => {
			if (el.tagName !== 'IMG') {
				usuario = el;
				const texto = el.querySelector('.chat-user .rounded-3xl .markdown-prose')?.textContent.trim() || '';
				if (texto.startsWith(PEDIDO)) quiere.set(el, ['pedido', ultima?.src]);
				return;
			}
			ultima = el;
			const mensaje = el.closest('[id^="message-"]');
			if (usuario && regeneradas.has(mensaje) && !quiere.has(usuario)) quiere.set(usuario, ['regenerada', el.src]);
		});
		document.querySelectorAll('.user-message').forEach((u) => {
			const [tipo, src] = quiere.get(u) || [];
			const burbuja = u.querySelector('.chat-user .rounded-3xl');
			// pedido: el chip va dentro de la burbuja y el texto no se ve
			const enBurbuja = burbuja?.querySelector(':scope > .sk-img-chip');
			if (tipo === 'pedido' && burbuja) {
				if (!burbuja.classList.contains('sk-img-pedido')) burbuja.classList.add('sk-img-pedido');
				const c = enBurbuja || burbuja.appendChild(chip('pedido'));
				ponerMiniatura(c, src);
			} else if (burbuja?.classList.contains('sk-img-pedido')) {
				burbuja.classList.remove('sk-img-pedido');
				enBurbuja?.remove();
			}
			// regenerada: fila propia debajo de la burbuja
			const fila = u.querySelector('.sk-img-chip-fila');
			if (tipo === 'regenerada' && burbuja) {
				let f = fila;
				if (!f) {
					f = document.createElement('div');
					f.className = 'sk-img-chip-fila';
					f.appendChild(chip('regenerada'));
					burbuja.parentElement.after(f);
				}
				ponerMiniatura(f.firstElementChild, src);
			} else fila?.remove();
		});
	};

	const imagenes = () => {
		const porMensaje = new Map();
		document.querySelectorAll(".chat-assistant img[alt='generated-image.png']").forEach((img) => {
			const mensaje = img.closest('[id^="message-"]');
			if (!mensaje) return;
			if (!porMensaje.has(mensaje)) porMensaje.set(mensaje, []);
			porMensaje.get(mensaje).push(img);
		});
		const regeneradas = new Set();
		porMensaje.forEach((imgs, mensaje) => {
			const v = versiones(mensaje);
			if (v && v[0] > 1) regeneradas.add(mensaje);
			if (imgs.length > 1) cuadricula(imgs, mensaje, v);
			else {
				mensaje.querySelector('.sk-img-variaciones')?.remove();
				decorar(imgs[0], mensaje, v);
			}
		});
		chips(regeneradas);
	};

	/* ---------- ciclo ---------- */
	const actualizar = () => {
		pendiente = false;
		let generando = false;
		// mensaje → dónde va la tarjeta. Se activa con la fila "Ejecutando generate_image…" o con el estado
		// "Generando imagen … % · paso n/m" que pone el medidor de rendimiento (a veces llega antes que la fila).
		const enCurso = new Map();
		document.querySelectorAll('.chat-assistant .status-description').forEach((e) => {
			const bloque = e.closest('div.relative.w-full') ?? e;
			const mensaje = e.closest('.chat-assistant');
			const esImagen = /Generando imagen/.test(e.textContent);
			const yaTieneImagen = !!mensaje?.querySelector("img[alt='generated-image.png']");
			if (esImagen && mensaje && !yaTieneImagen && !enCurso.has(mensaje)) enCurso.set(mensaje, bloque);
			// "Generando imagen … %" lo reemplaza la tarjeta; "Imagen lista … % · 172 s" repite la insignia "Lista"
			const ocultar = esImagen || /Imagen lista/.test(e.textContent);
			if (bloque.classList.contains('sk-img-estado-oculto') !== ocultar) bloque.classList.toggle('sk-img-estado-oculto', ocultar);
		});
		document.querySelectorAll('.chat-assistant :is([id*="detail-group"], [id$="-tool-call"])').forEach((grupo) => {
			if (grupo.parentElement.closest('[id*="detail-group"], [id$="-tool-call"]')) return;
			const texto = grupo.textContent.trim();
			const corre = CORRIENDO.test(texto) && !TERMINADA.test(texto) && HERRAMIENTA.test(texto);
			// como en el lienzo, la fila de la herramienta no se ve: mientras corre la reemplaza la tarjeta y al terminar
			// la imagen ya está arriba. Solo si todas las herramientas de la fila son de imagen (generar, editar, mostrar).
			const nombres = texto.match(/\b[a-z]+(?:_[a-z]+)+\b/g) || [];
			const soloImagen = nombres.length > 0 && nombres.every((n) => /^(generate_image|edit_image|display_file)$/.test(n));
			if (grupo.classList.contains('sk-img-herramienta') !== soloImagen) grupo.classList.toggle('sk-img-herramienta', soloImagen);
			const mensaje = grupo.closest('.chat-assistant');
			if (corre && mensaje) enCurso.set(mensaje, grupo);
		});
		// respuestas a "Genera 4 variaciones…": mientras corren se ve la cuadrícula de carga (las listas, la que se genera
		// y las que esperan) en lugar de las imágenes sueltas
		const variando = new Set();
		let pidio = false;
		document.querySelectorAll('.user-message, .chat-assistant').forEach((el) => {
			if (el.classList.contains('user-message')) {
				pidio = (el.querySelector('.chat-user .rounded-3xl .markdown-prose')?.textContent.trim() || '').startsWith(PEDIDO);
			} else if (pidio) variando.add(el);
		});
		document.querySelectorAll('.sk-img-gen').forEach((t) => {
			const m = t.closest('.chat-assistant');
			if (!enCurso.has(m) || t.classList.contains('sk-img-gen-var') !== variando.has(m)) t.remove();
		});
		document.querySelectorAll('.chat-assistant[data-sk-variando]').forEach((m) => {
			if (!enCurso.has(m)) m.removeAttribute('data-sk-variando');
		});
		enCurso.forEach((ancla, mensaje) => {
			generando = true;
			const esVar = variando.has(mensaje);
			let t = mensaje.querySelector('.sk-img-gen');
			if (!t) {
				t = esVar ? tarjetaVariaciones() : tarjeta();
				ancla.after(t);
			}
			if (esVar) {
				if (!mensaje.hasAttribute('data-sk-variando')) mensaje.setAttribute('data-sk-variando', '');
				t._listas = [...mensaje.querySelectorAll("img[alt='generated-image.png']")];
			}
			pintar(t);
		});
		imagenes();

		if (generando && !sondeo) {
			const vuelta = async () => {
				await consultar();
				document.querySelectorAll('.sk-img-gen').forEach(pintar);
				sondeo = document.querySelector('.sk-img-gen') ? setTimeout(vuelta, 700) : null;
			};
			sondeo = setTimeout(vuelta, 0);
		}
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true, characterData: true });
	consultar();
})();

/*
 * Ajustes en el teléfono (lienzo "Ajustes rediseñados · escritorio y móvil"): al abrir Ajustes primero se ve un índice
 * (título, buscador, tarjeta de la cuenta y las pestañas de Open WebUI agrupadas como en su menú) y, al tocar una, su
 * pantalla con "‹ Ajustes" para volver. El índice se arma con las pestañas reales (mismos nombres, íconos y grupos),
 * así que tocar una es tocar la pestaña de Open WebUI. Cerrar usa el "Volver" de Open WebUI.
 */
(() => {
	const TELEFONO = window.matchMedia('(max-width: 767px)');
	const SVG = {
		atras: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
		lupa: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
		cerrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
		flecha: '<svg class="sk-aj-flecha" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>'
	};
	let pendiente = false;

	const etiqueta = (el) => el.textContent.trim();

	const elemento = (html) => {
		const t = document.createElement('template');
		t.innerHTML = html.trim();
		return t.content.firstElementChild;
	};

	const abrirPestana = (panel, id) => {
		panel.querySelector(`#settings-tabs-container [aria-controls='${id}']`)?.click();
		panel.classList.remove('sk-aj-en-indice');
		requestAnimationFrame(() => {
			const activa = panel.querySelector(`#settings-tabs-container [aria-controls='${id}']`);
			activa?.scrollIntoView({ block: 'nearest', inline: 'center' });
		});
	};

	// nombre, foto y rol de la sesión (la barra lateral puede estar cerrada en el teléfono)
	let sesion = null;
	const usuario = async () => {
		if (sesion) return sesion;
		try {
			const r = await fetch('/api/v1/auths/', { headers: { Authorization: `Bearer ${localStorage.token || ''}` } });
			sesion = r.ok ? await r.json() : {};
		} catch {
			sesion = {};
		}
		return sesion;
	};

	const armarIndice = (panel, nav) => {
		const indice = document.createElement('div');
		indice.className = 'sk-aj-indice';
		indice.innerHTML = `
			<div class="sk-aj-indice-titulo">Ajustes</div>
			<label class="sk-aj-indice-buscar">${SVG.lupa}<input type="search" placeholder="Buscar ajustes" aria-label="Buscar ajustes"></label>`;

		// cuenta
		const cuenta = nav.querySelector("[aria-controls='tab-account']");
		const admin = !!nav.querySelector("[aria-controls^='tab-admin-']");
		if (cuenta) {
			const tarjeta = elemento(`<button type="button" class="sk-aj-cuenta" data-tab="tab-account">
				<span class="sk-aj-iniciales">?</span><span><b>Cuenta</b><small>${admin ? 'Administrador · ' : ''}Cuenta y perfil</small></span>${SVG.flecha}</button>`);
			indice.appendChild(tarjeta);
			usuario().then(({ name, profile_image_url }) => {
				if (name) {
					tarjeta.querySelector('b').textContent = name;
					tarjeta.querySelector('.sk-aj-iniciales').textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
				}
				if (profile_image_url) {
					const img = document.createElement('img');
					img.alt = '';
					img.src = profile_image_url;
					img.addEventListener('load', () => tarjeta.querySelector('.sk-aj-iniciales')?.replaceWith(img), { once: true });
				}
			});
		}

		// grupos tal como vienen en el menú de Open WebUI: rótulo mayor (Personal, Administrador) y sub-rótulos
		let seccion = null;
		const nuevaSeccion = (titulo) => {
			seccion = elemento('<section class="sk-aj-seccion"><h3></h3><div class="sk-aj-lista"></div></section>');
			seccion.querySelector('h3').textContent = titulo;
			indice.appendChild(seccion);
		};
		const recorrer = (nodo) => {
			for (const hijo of nodo.children) {
				if (hijo.getAttribute('role') === 'tablist' || getComputedStyle(hijo).display === 'contents') {
					recorrer(hijo);
				} else if (hijo.matches("[role='tab']")) {
					const id = hijo.getAttribute('aria-controls');
					if (!id || id === 'tab-account') continue;
					if (!seccion) nuevaSeccion('');
					const item = elemento(`<button type="button" class="sk-aj-item" data-tab="${id}"><span class="sk-aj-icono"></span><span></span>${SVG.flecha}</button>`);
					const icono = hijo.querySelector('svg');
					if (icono) item.querySelector('.sk-aj-icono').appendChild(icono.cloneNode(true));
					item.querySelector('span:nth-child(2)').textContent = etiqueta(hijo);
					seccion.querySelector('.sk-aj-lista').appendChild(item);
				} else if (hijo.matches('span') && etiqueta(hijo)) {
					// rótulo: si el siguiente hermano es un tablist, es un rótulo mayor
					const siguiente = hijo.nextElementSibling;
					if (siguiente?.getAttribute('role') === 'tablist') {
						const mayor = elemento('<div class="sk-aj-grupo-mayor"></div>');
						mayor.textContent = etiqueta(hijo);
						indice.appendChild(mayor);
						seccion = null;
					} else {
						nuevaSeccion(etiqueta(hijo));
					}
				}
			}
		};
		const tabs = nav.querySelector('.tabs');
		if (tabs) recorrer(tabs);
		indice.querySelectorAll('.sk-aj-seccion').forEach((s) => {
			if (!s.querySelector('.sk-aj-item')) s.remove();
		});

		indice.addEventListener('click', (e) => {
			const b = e.target.closest('[data-tab]');
			if (b) abrirPestana(panel, b.dataset.tab);
		});
		const buscar = indice.querySelector('input');
		buscar.addEventListener('input', () => {
			const q = buscar.value.trim().toLowerCase();
			indice.querySelectorAll('.sk-aj-item').forEach((i) => (i.hidden = !!q && !i.textContent.toLowerCase().includes(q)));
			indice.querySelectorAll('.sk-aj-seccion').forEach((s) => (s.hidden = !s.querySelector('.sk-aj-item:not([hidden])')));
			indice.querySelectorAll('.sk-aj-grupo-mayor').forEach((g) => (g.hidden = !!q));
			const c = indice.querySelector('.sk-aj-cuenta');
			if (c) c.hidden = !!q && !'cuenta perfil'.includes(q) && !c.textContent.toLowerCase().includes(q);
		});
		return indice;
	};

	const montar = (panel) => {
		const nav = panel.querySelector(':scope > #settings-tabs-container');
		if (!nav) return;
		panel.classList.add('sk-aj-movil', 'sk-aj-en-indice');
		const cabeza = elemento(`<div class="sk-aj-cabeza">
			<button type="button" class="sk-aj-atras">${SVG.atras}Ajustes</button>
			<button type="button" class="sk-aj-buscar" aria-label="Buscar ajustes">${SVG.lupa}</button>
			<button type="button" class="sk-aj-cerrar" aria-label="Cerrar">${SVG.cerrar}</button></div>`);
		const indice = armarIndice(panel, nav);
		cabeza.querySelector('.sk-aj-atras').addEventListener('click', () => {
			panel.classList.add('sk-aj-en-indice');
			indice.scrollTop = 0;
		});
		cabeza.querySelector('.sk-aj-buscar').addEventListener('click', () => {
			panel.classList.add('sk-aj-en-indice');
			indice.querySelector('input').focus();
		});
		cabeza.querySelector('.sk-aj-cerrar').addEventListener('click', () => {
			nav.querySelector(':scope > div:first-child > button')?.click();
		});
		panel.prepend(cabeza);
		panel.appendChild(indice);
	};

	const desmontar = (panel) => {
		panel.classList.remove('sk-aj-movil', 'sk-aj-en-indice');
		panel.querySelector(':scope > .sk-aj-cabeza')?.remove();
		panel.querySelector(':scope > .sk-aj-indice')?.remove();
	};

	const actualizar = () => {
		pendiente = false;
		const nav = document.querySelector('.modal[role="dialog"] #settings-tabs-container');
		const panel = nav?.parentElement;
		if (!panel) return;
		const montado = panel.classList.contains('sk-aj-movil');
		if (TELEFONO.matches && !montado) montar(panel);
		else if (!TELEFONO.matches && montado) desmontar(panel);
	};

	TELEFONO.addEventListener('change', actualizar);
	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true });
})();

/*
 * Teléfono: el menú de usuario va fuera de la barra lateral (Open WebUI lo pone en el body). Para alinearlo con la barra
 * se copia su ancho (--sidebar-width de #sidebar) en --sk-barra-ancho del documento; solo se escribe si cambia.
 */
(() => {
	let pendiente = false;
	const actualizar = () => {
		pendiente = false;
		const barra = document.querySelector('#sidebar');
		if (!barra) return;
		const ancho = `${Math.round(barra.getBoundingClientRect().width)}px`;
		if (ancho !== '0px' && document.documentElement.style.getPropertyValue('--sk-barra-ancho') !== ancho) {
			document.documentElement.style.setProperty('--sk-barra-ancho', ancho);
		}
	};
	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true });
	window.addEventListener('resize', actualizar);
})();

/*
 * Buscar (lienzo "Buscar rediseñado · móvil y escritorio"): marca la caja de búsqueda de Open WebUI (.sk-buscar-caja),
 * agrega las píldoras de tipo (Todo · Chats · Notas, las opciones que trae Open WebUI) debajo del buscador, el botón
 * "Abrir chat" en la vista previa y las teclas del pie. Las píldoras usan el selector de tipo de Open WebUI: se abre
 * sin verse, se toca la opción y se cierra.
 */
(() => {
	const TIPOS = [
		['Todo', ''],
		['Chats', '<path d="M4 5h16v11H9l-5 4z"/>'],
		['Notas', '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>']
	];
	const svg = (d) =>
		`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
	let pendiente = false;
	let eligiendo = false;

	const tipoActual = (caja) => {
		const b = caja.querySelector("button[aria-label^='Tipo de contenido']");
		return (b?.textContent || 'Todo').trim();
	};

	const elegir = async (caja, nombre) => {
		if (eligiendo || tipoActual(caja) === nombre) return;
		const boton = caja.querySelector("button[aria-label^='Tipo de contenido']");
		if (!boton) return;
		eligiendo = true;
		document.documentElement.classList.add('sk-buscar-eligiendo');
		try {
			// se abre después del clic de la píldora: si no, el mismo clic cuenta como "clic afuera" y lo cierra
			await new Promise((r) => setTimeout(r, 30));
			boton.click();
			for (let i = 0; i < 20; i++) {
				await new Promise((r) => setTimeout(r, 40));
				const opcion = [...caja.querySelectorAll('[data-search-panel] .app-dropdown-menu button')].find(
					(b) => b.textContent.trim() === nombre
				);
				if (opcion) {
					opcion.click();
					break;
				}
			}
			await new Promise((r) => setTimeout(r, 60));
			if (caja.querySelector('[data-search-panel] .app-dropdown-menu')) boton.click();
		} finally {
			setTimeout(() => document.documentElement.classList.remove('sk-buscar-eligiendo'), 150);
			eligiendo = false;
			caja.querySelector('input')?.focus();
		}
	};

	const montar = (caja) => {
		caja.classList.add('sk-buscar-caja');
		const cabeza = caja.firstElementChild;
		if (cabeza && !caja.querySelector(':scope > .sk-buscar-chips')) {
			const fila = document.createElement('div');
			fila.className = 'sk-buscar-chips';
			fila.setAttribute('role', 'group');
			fila.setAttribute('aria-label', 'Tipo de contenido');
			fila.innerHTML = TIPOS.map(
				([nombre, icono]) => `<button type="button" data-tipo="${nombre}" aria-pressed="false">${icono ? svg(icono) : ''}${nombre}</button>`
			).join('');
			fila.addEventListener('click', (e) => {
				const b = e.target.closest('[data-tipo]');
				if (b) elegir(caja, b.dataset.tipo);
			});
			cabeza.after(fila);
		}
	};

	const actualizar = () => {
		pendiente = false;
		const lista = document.querySelector('#workspace-search-results');
		const caja = lista?.closest('.modal')?.querySelector(':scope > div > div');
		if (!caja) return;
		if (!caja.classList.contains('sk-buscar-caja')) montar(caja);

		// píldora activa
		const actual = tipoActual(caja);
		caja.querySelectorAll('.sk-buscar-chips [data-tipo]').forEach((b) => {
			const v = String(b.dataset.tipo === actual);
			if (b.getAttribute('aria-pressed') !== v) b.setAttribute('aria-pressed', v);
		});

		// "Abrir chat" en la vista previa: usa el botón Abrir del pie
		const vista = caja.querySelector("section[aria-label='Vista previa del resultado']");
		if (vista && !vista.querySelector(':scope > .sk-buscar-abrir')) {
			const abrir = document.createElement('button');
			abrir.type = 'button';
			abrir.className = 'sk-buscar-abrir';
			abrir.innerHTML = `${svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>')}Abrir chat`;
			abrir.addEventListener('click', () => {
				const pie = caja.lastElementChild;
				[...pie.querySelectorAll('button')].find((b) => /Abrir|Open/.test(b.textContent))?.click();
			});
			vista.appendChild(abrir);
		}

		// teclas del pie
		const pie = caja.lastElementChild;
		if (pie && !pie.contains(lista) && !pie.classList.contains('sk-buscar-chips') && !pie.querySelector('.sk-buscar-teclas')) {
			const teclas = document.createElement('span');
			teclas.className = 'sk-buscar-teclas';
			teclas.innerHTML = '<span><kbd>↑</kbd><kbd>↓</kbd>Moverse</span><span><kbd>↵</kbd>Abrir</span>';
			pie.prepend(teclas);
		}
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true, characterData: true });
})();

/*
 * Barra lateral rediseñada (lienzo "Barra lateral rediseñada · escritorio y móvil", variación C claro): la interfaz
 * toma el color del modelo activo. Igual que los pétalos de la bienvenida, el color sale del avatar de cada modelo
 * (window.skCalcularColores), así que un modelo o ícono nuevo trae su color solo. Se publica como variables:
 *   --sk-m         acento ("338 67% 52%", para hsl(var(--sk-m) / alfa))
 *   --sk-m-oscuro  texto sobre el tinte ("Modelo activo")
 *   --sk-m-tinte   fondo claro de la tarjeta del modelo
 * Agrega a la barra la tarjeta "Modelo activo" (abre el selector de modelo) y la fila "Modelos fijados" (los demás
 * modelos fijados; tocar uno abre un chat nuevo con él). Cada chat de la lista lleva el avatar de su modelo y su
 * color (anillo al pensar, renglón teñido con punto al llegar respuesta, barra del chat abierto): el modelo de cada
 * chat se lee una vez de la API y se guarda. El resto (Nuevo chat negro con Buscar al lado, tarjeta del usuario…)
 * es CSS sobre las piezas de Open WebUI.
 */
(() => {
	const CLAVE_COLORES = 'sk-modelo-colores-2';
	const CLAVE_CHATS = 'sk-chat-modelo';
	const RESPALDO = { m: '220 14% 46%', oscuro: '220 16% 34%', tinte: '220 20% 95%' };
	const leer = (clave) => {
		try {
			return JSON.parse(localStorage.getItem(clave) || '{}');
		} catch {
			return {};
		}
	};
	const guardar = (clave, valor) => {
		try {
			localStorage.setItem(clave, JSON.stringify(valor));
		} catch {
			// sin localStorage: se recalcula en cada carga
		}
	};
	const colores = leer(CLAVE_COLORES); // id del modelo → { m, oscuro, tinte }
	const chatModelo = leer(CLAVE_CHATS); // id del chat → id del modelo
	// el último modelo activo, los fijados y los nombres se recuerdan: al recargar, la tarjeta "Modelo activo" y la fila
	// de fijados salen completas desde el primer cuadro en lugar de aparecer vacías y rellenarse un instante después
	const CLAVE_ULTIMO = 'sk-barra-ultimo';
	const ultimo = leer(CLAVE_ULTIMO); // { activo, fijados: [ids] }
	const nombres = leer('sk-modelo-nombres'); // id del modelo → nombre
	const calculando = new Set();
	const pidiendo = new Set();
	let pendiente = false;
	const avatar = (id) => `/api/v1/models/model/profile/image?id=${encodeURIComponent(id)}`;
	const headers = () => ({ Authorization: `Bearer ${localStorage.token || ''}` });
	const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
	const svg = (d, tam = 18) =>
		`<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
	const limitar = (v, a, b) => Math.min(b, Math.max(a, v));

	// paleta del modelo a partir del cálculo de los pétalos: acento = tono fuerte del avatar con brillo de 43–54 %,
	// texto un 9 % más oscuro (contraste ≥ 4.5:1 sobre el tinte) y tinte con el tono principal
	const paleta = (c) => {
		if (c?.fh == null) return null;
		const s = Math.round(limitar((c.fs || 0.6) * 1.25, 0.55, 0.8) * 100);
		const l = limitar((c.fl ?? 0.42) + 0.06, 0.43, 0.54);
		return {
			m: `${c.fh} ${s}% ${Math.round(l * 100)}%`,
			oscuro: `${c.fh} ${s}% ${Math.round(Math.min(l - 0.09, 0.42) * 100)}%`,
			tinte: `${c.h} 80% 94%`
		};
	};

	const calcularColor = (id) => {
		if (!id || colores[id] || calculando.has(id) || !window.skCalcularColores) return;
		calculando.add(id);
		const img = new Image();
		img.onload = () => {
			try {
				const p = paleta(window.skCalcularColores(img));
				if (p) {
					colores[id] = p;
					guardar(CLAVE_COLORES, colores);
					programar();
				}
			} catch {
				// imagen que no se puede leer: queda el color de respaldo
			}
		};
		img.src = avatar(id);
	};
	// el selector de modelo de la barra usa los mismos colores
	window.skColorModelo = (id) => {
		calcularColor(id);
		return colores[id] || null;
	};

	// nombres de los modelos guardados en Espacio de Trabajo
	fetch('/api/v1/models/list', { headers: headers() })
		.then((r) => (r.ok ? r.json() : null))
		.then((d) => {
			for (const m of Array.isArray(d) ? d : d?.items || d?.data || []) nombres[m.id] = m.name;
			guardar('sk-modelo-nombres', nombres);
			programar();
		})
		.catch(() => {});

	// versión de Open WebUI debajo del nombre
	fetch('/api/version')
		.then((r) => (r.ok ? r.json() : null))
		.then((d) => d?.version && document.documentElement.style.setProperty('--sk-version', `"v${d.version}"`))
		.catch(() => {});

	const idDeSrc = (src) => {
		try {
			return new URL(src, location.origin).searchParams.get('id');
		} catch {
			return null;
		}
	};

	// modelo activo: el del selector de la caja de mensaje; si no hay, el del chat abierto o el de la bienvenida
	const modeloActivo = () => {
		const img = document.querySelector(
			"#message-input-container :is(button, [aria-label^='Modelo']) img[src*='/models/model/profile/image']"
		);
		const deCaja = img && idDeSrc(img.getAttribute('src'));
		if (deCaja) return deCaja;
		const chat = (location.pathname.match(/\/c\/([^/?#]+)/) || [])[1];
		if (chat && chatModelo[chat]) return chatModelo[chat];
		const bienvenida = document.querySelector(".sk-bienvenida-avatar img[src*='/models/model/profile/image']");
		return (bienvenida && idDeSrc(bienvenida.getAttribute('src'))) || document.querySelector('#pinned-models-list [data-id]')?.dataset.id || ultimo.activo || null;
	};

	const nombreDe = (id) =>
		nombres[id] ||
		document.querySelector(`#pinned-models-list [data-id="${CSS.escape(id)}"]`)?.textContent.trim() ||
		id;

	// el modelo de cada chat (una vez; 3 a la vez)
	const pedirModelos = async (ids) => {
		const faltan = ids.filter((id) => !(id in chatModelo) && !pidiendo.has(id));
		if (!faltan.length) return;
		faltan.forEach((id) => pidiendo.add(id));
		const trabajar = async () => {
			while (faltan.length) {
				const id = faltan.shift();
				try {
					const r = await fetch(`/api/v1/chats/${encodeURIComponent(id)}`, { headers: headers() });
					if (r.ok) {
						const d = await r.json();
						chatModelo[id] = d?.chat?.models?.[0] || null;
					}
				} catch {
					// sin conexión: se intenta en la siguiente carga
				}
				pidiendo.delete(id);
			}
		};
		await Promise.all([trabajar(), trabajar(), trabajar()]);
		guardar(CLAVE_CHATS, chatModelo);
		programar();
	};

	// hoja con el avatar y el color de cada chat (sin tocar los elementos de Open WebUI)
	const hoja = document.createElement('style');
	hoja.id = 'sk-barra-colores';
	let hojaTexto = '';
	const variables = (p) => `--sk-m:${p.m};--sk-m-oscuro:${p.oscuro};--sk-m-tinte:${p.tinte};`;

	const pintarHoja = (ids) => {
		const porModelo = new Map();
		for (const chat of ids) {
			const m = chatModelo[chat];
			if (!m) continue;
			calcularColor(m);
			if (!porModelo.has(m)) porModelo.set(m, []);
			porModelo.get(m).push(chat);
		}
		let texto = '';
		porModelo.forEach((chats, m) => {
			const p = colores[m] || RESPALDO;
			const sel = chats.map((c) => `#sidebar-chat-item:has(> a[href="/c/${CSS.escape(c)}"])`).join(',');
			texto += `${sel}{${variables(p)}--sk-chat-avatar:url("${avatar(m)}");}\n`;
		});
		if (texto !== hojaTexto) {
			hojaTexto = texto;
			hoja.textContent = texto;
		}
		if (!hoja.isConnected) document.head.appendChild(hoja);
	};

	const tarjeta = () => {
		const t = document.createElement('div');
		t.className = 'sk-barra-extra';
		t.innerHTML = `
			<button type="button" class="sk-barra-modelo" aria-haspopup="listbox">
				<img alt="">
				<span class="sk-barra-modelo-texto"><b></b><small>Modelo activo</small></span>
				${svg('<path d="M6 9l6 6 6-6"/>', 17)}
			</button>
			<div class="sk-barra-fijados" role="group" aria-label="Modelos fijados">
				<span class="sk-barra-avatares"></span>
				<span class="sk-barra-fijados-texto">Modelos fijados</span>
			</div>`;
		// abre el selector de modelo de la caja de mensaje; sin caja (otra página), un chat nuevo
		t.querySelector('.sk-barra-modelo').addEventListener('click', (e) => {
			e.stopPropagation();
			window.skSelectorModelo?.alternar(t.querySelector('.sk-barra-modelo'));
		});
		t.querySelector('.sk-barra-avatares').addEventListener('click', (e) => {
			const b = e.target.closest('[data-modelo]');
			if (!b) return;
			document.querySelector(`#pinned-models-list [data-id="${CSS.escape(b.dataset.modelo)}"] a`)?.click();
		});
		// la fila de fijados vive dentro de la lista que se desliza (se va con Nuevo Chat y las píldoras); se guarda aquí
		// para encontrarla aunque ya no sea hija de la tarjeta
		t.skFijados = t.querySelector('.sk-barra-fijados');
		return t;
	};

	// al deslizar la lista, un degradado arriba desvanece los chats en lugar de cortarlos de golpe bajo la tarjeta. Se
	// enciende cuando Nuevo Chat ya pasó del todo: desvanecer ese botón negro (blanco en oscuro) sobre el panel claro se
	// veía como un brillo; así el botón se oculta limpio y lo que se desvanece son las píldoras y los chats.
	const marcarDesplazada = (lista) => {
		const boton = lista.querySelector('#sidebar-new-chat-button');
		const limite = boton ? boton.getBoundingClientRect().bottom - lista.getBoundingClientRect().top + lista.scrollTop : 2;
		const arriba = lista.scrollTop > 2 && lista.scrollTop >= limite;
		if (lista.classList.contains('sk-lista-desplazada') !== arriba) lista.classList.toggle('sk-lista-desplazada', arriba);
	};

	const montar = () => {
		const raiz = document.querySelector('#sidebar > div');
		const cabeza = raiz?.firstElementChild;
		if (!cabeza || document.querySelector('#sidebar:has(#sidebar-open-button)')) return null;
		let extra = raiz.querySelector(':scope > .sk-barra-extra');
		if (!extra) {
			extra = tarjeta();
			cabeza.after(extra);
		}
		const fijados = extra.skFijados;
		const lista = raiz.querySelector(':scope > .overflow-y-auto');
		if (fijados && lista) {
			if (lista.firstElementChild !== fijados) lista.prepend(fijados);
			if (!lista.dataset.skDesvanecer) {
				lista.dataset.skDesvanecer = '1';
				lista.addEventListener('scroll', () => marcarDesplazada(lista), { passive: true });
			}
			marcarDesplazada(lista);
		} else if (fijados && fijados.parentElement !== extra) {
			extra.append(fijados);
		}
		return extra;
	};

	const actualizar = () => {
		pendiente = false;
		// color del modelo activo en toda la interfaz
		const id = modeloActivo();
		if (id) calcularColor(id);
		const p = (id && colores[id]) || RESPALDO;
		const raizDoc = document.documentElement;
		if (raizDoc.style.getPropertyValue('--sk-m') !== p.m) {
			raizDoc.style.setProperty('--sk-m', p.m);
			raizDoc.style.setProperty('--sk-m-oscuro', p.oscuro);
			raizDoc.style.setProperty('--sk-m-tinte', p.tinte);
		}
		// el chat abierto aprende su modelo del selector (sin pedirlo a la API)
		const chat = (location.pathname.match(/\/c\/([^/?#]+)/) || [])[1];
		const img = document.querySelector("#message-input-container img[src*='/models/model/profile/image']");
		const deCaja = img && idDeSrc(img.getAttribute('src'));
		if (chat && deCaja && chatModelo[chat] !== deCaja) {
			chatModelo[chat] = deCaja;
			guardar(CLAVE_CHATS, chatModelo);
		}

		// barra contraída: el modelo activo lleva el aro de su color
		document.querySelectorAll('.sk-rail-modelo').forEach((r) => {
			let modelo = null;
			try {
				modelo = new URL(r.href, location.origin).searchParams.get('model');
			} catch {
				// enlace sin modelo
			}
			const es = !!id && modelo === id;
			if (r.hasAttribute('data-activo') !== es) r.toggleAttribute('data-activo', es);
		});

		const extra = montar();
		// el CSS de la barra abierta se aplica solo con ella montada (la contraída tiene su propio diseño)
		raizDoc.classList.toggle('sk-barra-c', !!extra);
		if (extra && id) {
			// se compara con la propia imagen (no con una variable): en el teléfono la barra se desmonta al cerrarla y la
			// tarjeta nueva llega sin foto aunque el modelo no haya cambiado
			const foto = extra.querySelector('.sk-barra-modelo img');
			if (foto.dataset.modelo !== id) {
				foto.dataset.modelo = id;
				// la foto recordada (144 px en WebP, nítida en pantallas 3x) sale al instante; la del servidor se pide por detrás y, si cambió, la
				// reemplaza y se recuerda para la próxima vez
				if (ultimo.fotoId === id && ultimo.foto) foto.src = ultimo.foto;
				const real = new Image();
				real.onload = () => {
					if (foto.dataset.modelo !== id) return;
					try {
						const lienzo = document.createElement('canvas');
						lienzo.width = lienzo.height = 144;
						lienzo.getContext('2d').drawImage(real, 0, 0, 144, 144);
						const datos = lienzo.toDataURL('image/webp', 0.85);
						if (ultimo.foto !== datos || ultimo.fotoId !== id) {
							ultimo.foto = datos;
							ultimo.fotoId = id;
							guardar(CLAVE_ULTIMO, ultimo);
						}
						if (foto.src !== datos) foto.src = datos;
					} catch {
						foto.src = real.src;
					}
				};
				real.onerror = () => {
					if (foto.dataset.modelo === id && !foto.getAttribute('src')) foto.src = avatar(id);
				};
				real.src = avatar(id);
			}
			const nombre = nombreDe(id);
			const b = extra.querySelector('.sk-barra-modelo b');
			if (b.textContent !== nombre) b.textContent = nombre;
			const boton = extra.querySelector('.sk-barra-modelo');
			const etiqueta = `Modelo activo: ${nombre}. Cambiar de modelo`;
			if (boton.getAttribute('aria-label') !== etiqueta) boton.setAttribute('aria-label', etiqueta);
			// los demás modelos fijados
			// los fijados de Open WebUI en cuanto pinta su lista; mientras tanto, los recordados
			const lista = document.querySelector('#pinned-models-list');
			const todos = lista ? [...lista.querySelectorAll('[data-id]')].map((e) => e.dataset.id) : ultimo.fijados || [];
			if (lista && (ultimo.activo !== id || String(ultimo.fijados) !== String(todos))) {
				ultimo.activo = id;
				ultimo.fijados = todos;
				guardar(CLAVE_ULTIMO, ultimo);
			}
			const fijados = todos.filter((m) => m !== id);
			const caja = (extra.skFijados || extra).querySelector('.sk-barra-avatares');
			const firma = fijados.join('|');
			if (caja.dataset.firma !== firma) {
				caja.dataset.firma = firma;
				caja.innerHTML = fijados
					.map(
						(m) =>
							`<button type="button" data-modelo="${esc(m)}" aria-label="Chat nuevo con ${esc(nombreDe(m))}" title="${esc(nombreDe(m))}"><img alt="" src="${avatar(m)}"></button>`
					)
					.join('');
			}
			fijados.forEach(calcularColor);
		}

		// lista de chats
		const ids = [...document.querySelectorAll('#sidebar-chat-item > a[href^="/c/"]')].map((a) => a.getAttribute('href').slice(3));
		pintarHoja(ids);
		pedirModelos(ids);
	};

	const programar = () => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	};

	skVigilar(programar, {
		childList: true,
		subtree: true,
		attributes: true,
		attributeFilter: ['src']
	});
	window.addEventListener('popstate', programar);
	programar();
})();

/*
 * Tarjeta del usuario al pie de la barra (lienzo "Barra lateral rediseñada"): el engrane de 34 px abre Ajustes directo,
 * sin pasar por el menú de usuario (usa el atajo de Open WebUI, Ctrl/Cmd + punto); el resto de la tarjeta (avatar y
 * nombre) abre el menú completo como siempre. Si el atajo no abre Ajustes, se toca "Ajustes" en el menú sin que se vea.
 */
(() => {
	let pendiente = false;
	const ajustesAbiertos = () => !!document.querySelector('#settings-tabs-container');
	const porMenu = async () => {
		const boton = document.querySelector("#sidebar button[aria-haspopup='true']:has(img[aria-label='Abrir Menu de Perfiles de Usuario'])");
		if (!boton) return;
		document.documentElement.classList.add('sk-abriendo-ajustes');
		try {
			boton.click();
			for (let i = 0; i < 25; i++) {
				await new Promise((r) => setTimeout(r, 40));
				const opcion = [...document.querySelectorAll('[role="menu"] :is(button, a, [role="menuitem"])')].find((b) =>
					/^(Ajustes|Configuración|Settings)/i.test(b.textContent.trim())
				);
				if (opcion) {
					opcion.click();
					return;
				}
			}
			boton.click();
		} finally {
			setTimeout(() => document.documentElement.classList.remove('sk-abriendo-ajustes'), 200);
		}
	};
	const abrirAjustes = async () => {
		if (ajustesAbiertos()) return;
		const mac = /Mac|iPhone|iPad/.test(navigator.platform);
		document.dispatchEvent(
			new KeyboardEvent('keydown', { key: '.', code: 'Period', ctrlKey: !mac, metaKey: mac, bubbles: true, cancelable: true })
		);
		await new Promise((r) => setTimeout(r, 250));
		if (!ajustesAbiertos()) porMenu();
	};
	const montar = () => {
		pendiente = false;
		const fila = document.querySelector("#sidebar span[style*='contents']:has(img[aria-label='Abrir Menu de Perfiles de Usuario'])")?.parentElement;
		if (!fila || fila.querySelector(':scope > .sk-barra-ajustes')) return;
		fila.classList.add('sk-barra-usuario');
		const g = document.createElement('button');
		g.type = 'button';
		g.className = 'sk-barra-ajustes';
		g.setAttribute('aria-label', 'Ajustes');
		g.title = 'Ajustes';
		g.innerHTML =
			'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>';
		g.addEventListener('click', abrirAjustes);
		fila.appendChild(g);
	};
	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(montar);
	}, { childList: true, subtree: true });
})();

/*
 * Modo voz: al iniciarlo, Open WebUI abre las pestañas (en el teléfono, el cajón "Pestañas") y crea a la vez su pestaña
 * por defecto, el explorador de archivos "Inicio", junto a la pestaña Voz. Aquí se cierra esa pestaña de archivos solo
 * cuando nació junto con la de Voz (menos de 1.5 s de diferencia); una pestaña Inicio abierta antes o después a mano
 * no se toca.
 */
(() => {
	const VOZ = "path[d^='M12 1C10.34']";
	const ARCHIVOS = "path[d^='M2 11V4.6']";
	const nacio = new WeakMap(); // pestaña → cuándo apareció
	const cerradas = new WeakSet();
	let pendiente = false;

	const revisar = () => {
		pendiente = false;
		const ahora = Date.now();
		const pestanas = [...document.querySelectorAll("[role='tab']")].filter((t) => !t.closest('#settings-tabs-container'));
		pestanas.forEach((t) => nacio.has(t) || nacio.set(t, ahora));
		const voz = pestanas.find((t) => t.querySelector(VOZ));
		if (!voz) return;
		const tVoz = nacio.get(voz);
		if (ahora - tVoz > 3000) return;
		for (const t of pestanas) {
			if (t === voz || cerradas.has(t) || !t.querySelector(ARCHIVOS)) continue;
			if (Math.abs(nacio.get(t) - tVoz) > 1500) continue;
			const nombre = t.textContent.trim();
			const cerrar = t.parentElement?.querySelector(`button[aria-label='Cerrar ${CSS.escape(nombre)}'], button[aria-label='Close ${CSS.escape(nombre)}']`);
			if (!cerrar) continue;
			cerradas.add(t);
			cerrar.click();
			// la pestaña Voz queda elegida
			setTimeout(() => {
				const v = [...document.querySelectorAll("[role='tab']")].find((x) => x.querySelector(VOZ));
				if (v && v.getAttribute('aria-selected') !== 'true') v.click();
			}, 60);
		}
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(revisar);
	}, { childList: true, subtree: true });
})();

/*
 * Chat en pantalla ancha (lienzo "Chat en pantalla ancha · conceptos de accesibilidad y ergonomía"):
 *  - Conmutador "Compacta | Ampliada" en la barra de pestañas (pantallas de 1200 px o más). Compacta: el chat y la caja
 *    de mensaje en una columna de 1120 px centrada, el texto de las respuestas a 760 px (renglones legibles) y la imagen
 *    generada junto al texto. Ampliada: todo el ancho, como antes. Se recuerda en el navegador.
 *  - Encabezado de cada mensaje con la hora: "Sakura · 1:13 a. m." y, en los tuyos, "1:12 a. m. · tu nombre".
 *  - Métricas del medidor de rendimiento (la línea "⏱ 13.0s · ⚡ 2.95s · …") como una barra con íconos, separadores y
 *    la barrita del contexto; el botón de gráfica al final abre debajo la tarjeta "Rendimiento de la respuesta" (cada
 *    dato con su nombre y el reparto del tiempo entre pensar, herramientas y escribir).
 */
(() => {
	const CLAVE = 'sk-vista-chat';
	const raiz = document.documentElement;
	let vista = 'compacta';
	try {
		vista = localStorage.getItem(CLAVE) || 'compacta';
	} catch {
		// sin localStorage: compacta
	}
	const aplicar = () => {
		raiz.classList.toggle('sk-vista-compacta', vista === 'compacta');
		raiz.classList.toggle('sk-vista-ampliada', vista === 'ampliada');
	};
	aplicar();

	const svg = (d, tam = 14) =>
		`<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
	const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
	const ICONOS = {
		compacta: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 8v8M16 8v8"/>',
		ampliada: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 12h10M9 10l-2 2 2 2M15 10l2 2-2 2"/>',
		reloj: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 2h6"/>',
		rayo: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
		velocidad: '<path d="M5 15c-1 1-1.5 4-1.5 4s3-.5 4-1.5M9 13l2 2M14.5 4.5c2-1 4.5-1 4.5-1s0 2.5-1 4.5L12 14l-3-3z"/>',
		pensar: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.6.6 1 1.4 1 2.5h6c0-1.1.4-1.9 1-2.5A6 6 0 0 0 12 3z"/>',
		herramientas: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.4 2.4-2.6-.6-.6-2.6z"/>',
		escribir: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
		memoria: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
		imagen: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>',
		voz: '<path d="M5 10v4h3l4 4V6L8 10z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
		grafica: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>'
	};
	// emoji del medidor → [ícono, color, nombre]
	const EMOJIS = [
		[/^⏱/u, 'reloj', '#52525b', 'Tiempo total'],
		[/^⚡/u, 'rayo', '#e8890c', 'Primera palabra'],
		[/^🚀/u, 'velocidad', '#52525b', 'Velocidad'],
		[/^🤔/u, 'pensar', '#7c5cff', 'Pensar'],
		[/^🔧/u, 'herramientas', '#e8890c', 'Herramientas'],
		[/^✍/u, 'escribir', '#2361c7', 'Escribir'],
		[/^💾/u, 'memoria', '#14706a', 'Memoria'],
		[/^🎨/u, 'imagen', '#d6336c', 'Imagen'],
		[/^(🔊|🗣|🎙)/u, 'voz', '#d6336c', 'Voz']
	];
	const CONTEXTO = { '🟢': '#2b8a5a', '🟡': '#c99a06', '🟠': '#e8890c', '🔴': '#d9363e' };
	let pendiente = false;

	/* ---------- conmutador Compacta | Ampliada ---------- */
	const conmutador = () => {
		const d = document.createElement('div');
		d.className = 'sk-vista';
		d.setAttribute('role', 'radiogroup');
		d.setAttribute('aria-label', 'Ancho del chat');
		d.innerHTML = [
			['compacta', 'Compacta', 'Columna centrada, más fácil de leer'],
			['ampliada', 'Ampliada', 'Todo el ancho de la pantalla']
		]
			.map(([v, t, ayuda]) => `<button type="button" role="radio" data-vista="${v}" aria-checked="false" aria-label="${t}" title="${t} · ${ayuda}">${svg(ICONOS[v])}<span>${t}</span></button>`)
			.join('');
		d.addEventListener('click', (e) => {
			const b = e.target.closest('[data-vista]');
			if (!b) return;
			vista = b.dataset.vista;
			try {
				localStorage.setItem(CLAVE, vista);
			} catch {
				// sin localStorage: solo esta sesión
			}
			aplicar();
			programar();
		});
		return d;
	};

	/* ---------- tus datos (nombre y foto) para tus mensajes ---------- */
	let yo = null;
	fetch('/api/v1/auths/', { headers: { Authorization: `Bearer ${localStorage.token || ''}` } })
		.then((r) => (r.ok ? r.json() : null))
		.then((d) => {
			if (!d) return;
			yo = { nombre: (d.name || '').split(' ')[0] || d.name || '' };
			if (d.profile_image_url) raiz.style.setProperty('--sk-yo-avatar', `url("${String(d.profile_image_url).replace(/"/g, '%22')}")`);
			programar();
		})
		.catch(() => {});

	const hora = (el) => {
		const dt = el?.getAttribute('datetime');
		if (!dt) return '';
		const f = new Date(dt);
		return Number.isNaN(f.getTime()) ? '' : f.toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
	};

	/* ---------- métricas ---------- */
	const segundos = (t) => {
		const m = String(t).match(/([\d.]+)\s*s\b/g);
		return m ? parseFloat(m[m.length - 1]) : 0;
	};
	const dato = (texto) => {
		for (const [re, icono, color, nombre] of EMOJIS) {
			if (re.test(texto)) {
				const valor = texto.replace(re, '').replace(/^️/, '').trim();
				return { html: `<span class="sk-met" title="${nombre}"><i style="color:${color}">${svg(ICONOS[icono], 13)}</i>${esc(valor)}</span>`, icono, valor };
			}
		}
		const ctx = texto.match(/^(🟢|🟡|🟠|🔴)\s*(.*)$/u);
		if (ctx) {
			const pct = Math.min(100, parseFloat((ctx[2].match(/\((\d+(?:\.\d+)?)\s*%\)/) || [])[1] || 0));
			return {
				html: `<span class="sk-met" title="Contexto"><span class="sk-met-ctx"><span style="width:${pct}%;background:${CONTEXTO[ctx[1]]}"></span></span>${esc(ctx[2].replace(/\s*\(/, ' (').replace(/%\)/, ' %)'))}</span>`,
				icono: 'contexto'
			};
		}
		return { html: `<span class="sk-met">${esc(texto)}</span>`, icono: null, valor: texto };
	};

	const metricasHtml = (texto) => {
		const partes = texto.split(' · ').map((s) => s.trim()).filter(Boolean);
		const items = [];
		let desglose = false;
		for (const p of partes) {
			if (p.includes(' + ')) {
				desglose = true;
				const sub = p.split(' + ').map((s) => s.replace(/\s*=.*$/, '').trim()).map(dato);
				const tiempos = sub.map((s) => segundos(s.valor || ''));
				const total = tiempos.reduce((a, b) => a + b, 0) || 1;
				const colores = { pensar: '#7c5cff', herramientas: '#e8890c', escribir: '#2361c7' };
				const barra = sub
					.map((s, n) => `<span style="width:${Math.max(2, Math.round((tiempos[n] / total) * 46))}px;background:${colores[s.icono] || '#a1a1aa'}"></span>`)
					.join('');
				items.push(`<span class="sk-met-grupo">${sub.map((s) => s.html).join('<span class="sk-met-mas">+</span>')}<span class="sk-met-barra" aria-hidden="true">${barra}</span></span>`);
			} else if (desglose && /^=?\s*[\d.]+\s*s$/.test(p)) {
				// el total del desglose ya está en ⏱
			} else items.push(dato(p).html);
		}
		return items.join('<span class="sk-met-sep" aria-hidden="true">|</span>');
	};

	// tarjeta "Rendimiento de la respuesta": cada dato con su nombre y el reparto del tiempo en una barra grande
	const tarjetaHtml = (texto) => {
		const filas = [];
		let reparto = '';
		const fila = (p) => {
			for (const [re, icono, color, nombre] of EMOJIS) {
				if (re.test(p)) return { icono, color, nombre, valor: p.replace(re, '').replace(/^️/, '').trim() };
			}
			const ctx = p.match(/^(🟢|🟡|🟠|🔴)\s*(.*)$/u);
			if (ctx) return { icono: 'contexto', color: CONTEXTO[ctx[1]], nombre: 'Contexto usado', valor: ctx[2] };
			return null;
		};
		for (const p of texto.split(' · ').map((s) => s.trim()).filter(Boolean)) {
			if (p.includes(' + ')) {
				const sub = p.split(' + ').map((s) => fila(s.replace(/\s*=.*$/, '').trim())).filter(Boolean);
				const tiempos = sub.map((s) => segundos(s.valor));
				const total = tiempos.reduce((a, b) => a + b, 0) || 1;
				reparto = `<div class="sk-met-reparto"><div class="sk-met-reparto-barra" aria-hidden="true">${sub
					.map((s, n) => `<span style="flex:${Math.max(0.02, tiempos[n] / total)};background:${s.color}"></span>`)
					.join('')}</div><div class="sk-met-leyenda">${sub
					.map((s, n) => `<span><i style="background:${s.color}"></i>${s.nombre} ${esc(s.valor)} · ${Math.round((tiempos[n] / total) * 100)} %</span>`)
					.join('')}</div></div>`;
				sub.forEach((s) => filas.push(s));
			} else {
				const f = fila(p);
				if (f) filas.push(f);
			}
		}
		const BATERIA = '<rect x="3" y="7" width="18" height="10" rx="2"/><path d="M7 11v2M11 11v2"/>';
		const fila2 = (f) => {
			if (f.icono === 'contexto') {
				const pct = Math.min(100, parseFloat((f.valor.match(/\((\d+(?:\.\d+)?)\s*%\)/) || [])[1] || 0));
				const valor = f.valor.replace(/\s*\([^)]*\)/, '').replace('/', ' / ');
				return `<div><dt><i style="color:${f.color}">${svg(BATERIA, 14)}</i>${f.nombre}</dt><dd>${esc(valor)}</dd></div><div class="sk-met-ctx-fila" aria-hidden="true"><span style="width:${pct}%;background:${f.color}"></span></div>`;
			}
			const valor = f.icono === 'velocidad' ? f.valor.replace(/t\/s$/, ' tokens/s') : f.valor;
			return `<div><dt><i style="color:${f.color}">${svg(ICONOS[f.icono], 14)}</i>${f.nombre}</dt><dd>${esc(valor)}</dd></div>`;
		};
		return `<div class="sk-met-tarjeta-titulo">Rendimiento de la respuesta</div><dl>${filas.filter((f) => !['pensar', 'herramientas', 'escribir'].includes(f.icono) || !reparto).map(fila2).join('')}</dl>${reparto}`;
	};

	// teléfono: lo principal en corto (tiempo, velocidad, contexto, memoria). Cada dato lleva su clase: en la tarjeta del
	// "Mensaje en vidrio" el teléfono deja solo el tiempo y el escritorio angosto, tiempo y contexto
	const cortaHtml = (texto) => {
		const items = [];
		const k = (n) => `${Math.round(parseFloat(n))}K`;
		for (const p of texto.split(' · ').map((s) => s.trim())) {
			if (/^⏱/u.test(p)) {
				const s = segundos(p);
				items.push(['tiempo', `<i style="color:#71717a">${svg(ICONOS.reloj, 12)}</i>${s} s`]);
			} else if (/^🚀/u.test(p)) items.push(['velocidad', `<i style="color:#52525b">${svg(ICONOS.velocidad, 12)}</i>${esc(p.replace(/^🚀\s*/u, ''))}`]);
			else if (/^(🟢|🟡|🟠|🔴)/u.test(p)) {
				const m = p.match(/([\d.]+)K\s*\/\s*([\d.]+)K/);
				const pct = Math.min(100, parseFloat((p.match(/\((\d+(?:\.\d+)?)\s*%\)/) || [])[1] || 0));
				const color = CONTEXTO[[...p][0]] || '#2b8a5a';
				items.push(['contexto', `<span class="sk-met-ctx"><span style="width:${pct}%;background:${color}"></span></span>${m ? `${k(m[1])}/${k(m[2])}` : ''}`]);
			} else if (/^💾/u.test(p)) items.push(['memoria', `<i style="color:#14706a">${svg(ICONOS.memoria, 12)}</i>${esc(p.replace(/^💾\s*/u, ''))}`]);
		}
		return items
			.map(([tipo, h], n) => `<span class="sk-met-c sk-met-c-${tipo}">${n ? '<span class="sk-met-punto" aria-hidden="true">·</span>' : ''}${h}</span>`)
			.join('');
	};

	const telefonoMetricas = window.matchMedia('(max-width: 767px)');
	const metricas = () => {
		document.querySelectorAll('.chat-assistant .status-description').forEach((d) => {
			const texto = d.textContent.trim();
			if (!/^⏱/u.test(texto)) {
				if (d.hasAttribute('data-sk-metricas')) d.removeAttribute('data-sk-metricas');
				return;
			}
			const bloque = d.closest('div.relative.w-full');
			if (!bloque) return;
			if (!d.hasAttribute('data-sk-metricas')) d.setAttribute('data-sk-metricas', '');
			const raiz = d.closest('[id^="message-"]') || bloque.parentElement;
			let caja = raiz.querySelector('.sk-metricas');
			if (!caja) {
				caja = document.createElement('div');
				caja.className = 'sk-metricas';
				const id = `sk-met-${Math.random().toString(36).slice(2, 9)}`;
				caja.innerHTML = `<div class="sk-met-barra-datos"></div><span class="sk-met-corta"></span><button type="button" class="sk-met-detalle" aria-label="Ver rendimiento completo" title="Rendimiento de la respuesta" aria-expanded="false" aria-controls="${id}">${svg(ICONOS.grafica, 15)}</button><div class="sk-met-tarjeta" id="${id}" hidden></div>`;
				// la tarjeta de detalle se guarda aparte: con el mensaje terminado sale de la caja y va debajo de la fila
				caja.skTarjeta = caja.querySelector('.sk-met-tarjeta');
				const detalle = caja.querySelector('.sk-met-detalle');
				detalle.addEventListener('click', () => {
					const tarjeta = caja.skTarjeta;
					tarjeta.hidden = !tarjeta.hidden;
					detalle.setAttribute('aria-expanded', String(!tarjeta.hidden));
				});
				bloque.before(caja);
			}
			// "Mensaje en vidrio": las métricas van en la fila de las acciones (en gris, sin caja) y el detalle se abre
			// debajo, dentro de la misma tarjeta; mientras la respuesta se escribe (sin acciones todavía) quedan arriba
			const fila = raiz.querySelector('.buttons');
			if (fila?.parentElement) {
				const pie = fila.parentElement;
				if (!pie.classList.contains('sk-pie')) pie.classList.add('sk-pie');
				if (fila.nextElementSibling !== caja) fila.after(caja);
				if (caja.nextElementSibling !== caja.skTarjeta) caja.after(caja.skTarjeta);
			}
			if (caja.dataset.texto !== texto) {
				caja.dataset.texto = texto;
				caja.querySelector('.sk-met-barra-datos').innerHTML = metricasHtml(texto);
				caja.skTarjeta.innerHTML = tarjetaHtml(texto);
				caja.querySelector('.sk-met-corta').innerHTML = cortaHtml(texto);
			}
			// en la fila de acciones, si la barra completa no cabe junto a los botones se compacta a tiempo y contexto
			// en lugar de bajar de línea
			if (fila?.parentElement) {
				const barra = caja.querySelector('.sk-met-barra-datos');
				// en el teléfono la tarjeta se ajusta a su contenido: el espacio que cuenta es el que podría llegar a
				// ocupar (el ancho del mensaje menos el relleno de la tarjeta), no el que ocupa ahora
				const mensaje = telefonoMetricas.matches ? fila.closest("[id^='message-']") : null;
				const anchoPie = mensaje ? mensaje.clientWidth - 24 : fila.parentElement.clientWidth;
				const libre = anchoPie - fila.offsetWidth - 10 - 34;
				const ancho = caja.classList.contains('sk-met-compacta') ? Number(caja.dataset.anchoBarra || 0) : barra.scrollWidth;
				if (!caja.classList.contains('sk-met-compacta')) caja.dataset.anchoBarra = String(ancho);
				const compacta = ancho > libre;
				if (caja.classList.contains('sk-met-compacta') !== compacta) caja.classList.toggle('sk-met-compacta', compacta);
				// teléfono: si ni el tiempo cabe junto a las acciones, se quita y queda solo el botón de la gráfica
				// (el tiempo sigue en el detalle)
				const corta = caja.querySelector('.sk-met-corta');
				const sinTiempoAntes = caja.classList.contains('sk-met-sin-tiempo');
				const anchoCorta = sinTiempoAntes ? Number(caja.dataset.anchoCorta || 0) : corta.offsetWidth;
				if (!sinTiempoAntes && anchoCorta) caja.dataset.anchoCorta = String(anchoCorta);
				const libreTel = anchoPie - fila.offsetWidth - 6 - 24 - 4;
				const sinTiempo = telefonoMetricas.matches && anchoCorta > libreTel;
				if (sinTiempoAntes !== sinTiempo) caja.classList.toggle('sk-met-sin-tiempo', sinTiempo);
			}
		});
	};

	/* ---------- encabezados con hora ---------- */
	const encabezados = () => {
		document.querySelectorAll('[id^="message-"]:not(.user-message)').forEach((m) => {
			const h3 = m.querySelector(':scope h3:has(#response-message-model-name)');
			if (!h3) return;
			const texto = hora(m.querySelector('time[datetime]'));
			let s = h3.querySelector(':scope > .sk-hora');
			if (!texto) return s?.remove();
			if (!s) {
				s = document.createElement('span');
				s.className = 'sk-hora';
				h3.appendChild(s);
			}
			if (s.textContent !== texto) s.textContent = texto;
		});
		document.querySelectorAll('.user-message .chat-user').forEach((u) => {
			const texto = hora(u.querySelector('time[datetime]'));
			let c = u.querySelector(':scope > .sk-usuario-cabeza');
			if (!c) {
				c = document.createElement('div');
				c.className = 'sk-usuario-cabeza';
				c.innerHTML = '<span class="sk-hora"></span><b></b>';
				u.prepend(c);
			}
			const h = c.querySelector('.sk-hora');
			if (h.textContent !== texto) h.textContent = texto;
			const n = c.querySelector('b');
			const nombre = yo?.nombre || '';
			if (n.textContent !== nombre) n.textContent = nombre;
		});
	};

	const actualizar = () => {
		pendiente = false;
		// Open WebUI reescribe las clases de <html> al aplicar el tema: se vuelve a poner la vista elegida
		aplicar();
		// el conmutador va en la barra de pestañas del panel donde está el chat (con la vista dividida hay dos barras)
		// el chat visible: sus mensajes o, en una pestaña "Nuevo Chat" todavía vacía (o con otra pestaña oculta detrás),
		// su caja de mensaje; antes se tomaba el primer #messages-container aunque estuviera oculto y el conmutador
		// desaparecía con dos chats abiertos
		const chat = [...document.querySelectorAll("#messages-container, #message-input-container, [id^='side-chat-input-'][id$='-wrapper']")].find(
			(e) => e.getBoundingClientRect().width > 0
		);
		const r = chat?.getBoundingClientRect();
		const centro = r && r.width ? r.left + r.width / 2 : null;
		// con el modo voz abierto en escritorio, su panel ocupa la derecha bajo la misma barra: el conmutador se queda
		// del lado del chat, antes del panel de voz
		const panelVoz = [...document.querySelectorAll("[role='tabpanel']:has(.sk-voz-boton)")].find((p) => {
			const q = p.getBoundingClientRect();
			return q.width > 0 && centro != null && q.left > centro && !p.closest(".modal[role='dialog']");
		});
		const barras = [...document.querySelectorAll("div.h-9:has(button[aria-label='Nueva pestaña'])")];
		const suya =
			centro == null
				? null
				: barras.find((barra) => {
						const b = barra.getBoundingClientRect();
						return b.width && b.left <= centro && centro <= b.right;
					});
		barras.forEach((barra) => {
			let c = barra.querySelector(':scope > .sk-vista');
			if (barra !== suya) return c?.remove();
			if (!c) {
				c = conmutador();
				barra.appendChild(c);
			}
			// barra mediana: solo los íconos, para dejar sitio a las pestañas
			const rb = barra.getBoundingClientRect();
			const limite = panelVoz ? panelVoz.getBoundingClientRect().left - 8 : null;
			const ancho = limite != null ? limite - rb.left : rb.width;
			const iconos = ancho < 1300;
			if (c.classList.contains('sk-vista-iconos') !== iconos) c.classList.toggle('sk-vista-iconos', iconos);
			// se corre a la izquierda lo que haga falta para terminar antes del panel de voz
			const margen = parseFloat(c.style.marginRight) || 0;
			const nuevo = limite != null ? Math.max(0, Math.round(margen + c.getBoundingClientRect().right - limite)) : 0;
			if (Math.abs(nuevo - margen) > 1) c.style.marginRight = nuevo ? `${nuevo}px` : '';
			c.querySelectorAll('[data-vista]').forEach((b) => {
				const v = String(b.dataset.vista === vista);
				if (b.getAttribute('aria-checked') !== v) b.setAttribute('aria-checked', v);
			});
		});
		metricas();
		encabezados();
	};

	const programar = () => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	};

	skVigilar(programar, { childList: true, subtree: true, characterData: true });
	new MutationObserver(() => {
		if (!raiz.classList.contains(`sk-vista-${vista}`)) aplicar();
	}).observe(raiz, { attributes: true, attributeFilter: ['class'] });
	programar();
})();

/*
 * Pestañas con muchas abiertas: la tira de pestañas de cada panel (.panel-tab-strip, ya se desliza en horizontal) se
 * recorre con la rueda del ratón, con las flechas ‹ › que aparecen a los lados cuando no caben todas y arrastrando
 * en pantallas táctiles. Los bordes se desvanecen donde quedan pestañas escondidas y la pestaña nueva o la elegida
 * se acomoda a la vista.
 */
(() => {
	const FLECHA = {
		izq: '<path d="M15 6l-6 6 6 6"/>',
		der: '<path d="M9 6l6 6-6 6"/>'
	};
	const svg = (d) =>
		`<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
	let pendiente = false;
	const vistas = new WeakMap(); // tira → { izq, der, n }

	const estado = (tira) => {
		const v = vistas.get(tira);
		if (!v) return;
		const mas = tira.scrollWidth - tira.clientWidth > 2;
		const izq = mas && tira.scrollLeft > 2;
		const der = mas && tira.scrollLeft < tira.scrollWidth - tira.clientWidth - 2;
		if (tira.classList.contains('sk-mas-izq') !== izq) tira.classList.toggle('sk-mas-izq', izq);
		if (tira.classList.contains('sk-mas-der') !== der) tira.classList.toggle('sk-mas-der', der);
		if (v.izq.hidden !== !mas) v.izq.hidden = !mas;
		if (v.der.hidden !== !mas) v.der.hidden = !mas;
		if (v.izq.disabled !== !izq) v.izq.disabled = !izq;
		if (v.der.disabled !== !der) v.der.disabled = !der;
	};

	const flecha = (tira, dir) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'sk-pest-flecha';
		b.dataset.dir = dir;
		b.hidden = true;
		b.setAttribute('aria-label', dir === 'izq' ? 'Pestañas anteriores' : 'Más pestañas');
		b.title = dir === 'izq' ? 'Pestañas anteriores' : 'Más pestañas';
		b.innerHTML = svg(FLECHA[dir]);
		b.addEventListener('click', () => tira.scrollBy({ left: (dir === 'izq' ? -1 : 1) * tira.clientWidth * 0.7, behavior: 'smooth' }));
		return b;
	};

	const preparar = (tira) => {
		if (vistas.has(tira)) return;
		const izq = flecha(tira, 'izq');
		const der = flecha(tira, 'der');
		tira.before(izq);
		tira.after(der);
		vistas.set(tira, { izq, der, n: tira.children.length });
		// rueda vertical → desplazamiento horizontal
		tira.addEventListener(
			'wheel',
			(e) => {
				if (tira.scrollWidth <= tira.clientWidth || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
				tira.scrollLeft += e.deltaY;
				e.preventDefault();
			},
			{ passive: false }
		);
		tira.addEventListener('scroll', () => estado(tira), { passive: true });
		new ResizeObserver(() => estado(tira)).observe(tira);
	};

	const actualizar = () => {
		pendiente = false;
		document.querySelectorAll('.panel-tab-strip').forEach((tira) => {
			preparar(tira);
			const v = vistas.get(tira);
			// pestaña nueva: se va al final para que se vea
			if (tira.children.length > v.n) tira.scrollTo({ left: tira.scrollWidth, behavior: 'smooth' });
			v.n = tira.children.length;
			estado(tira);
		});
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true });
})();

/*
 * Al cambiar el ancho de la ventana (de escritorio a teléfono o al revés), Open WebUI rehace sus paneles y, si el panel
 * lateral quedó sin pestañas, crea su pestaña por defecto: el explorador de archivos "Inicio". Aquí se cierra esa
 * pestaña cuando aparece justo después del cambio (2.5 s) y hay más pestañas de archivos que las que tenías abiertas
 * antes; una pestaña Inicio abierta a mano se queda.
 */
(() => {
	const ARCHIVOS = "path[d^='M2 11V4.6']";
	const cortes = ['(max-width: 767px)', '(max-width: 1023px)'].map((q) => window.matchMedia(q));
	let tenias = null; // pestañas de archivos que tenías antes del cambio
	let hasta = 0;
	let pendiente = false;

	const archivos = () =>
		[...document.querySelectorAll("[role='tab'], .panel-tab")].filter((t) => !t.closest('#settings-tabs-container') && t.querySelector(ARCHIVOS));

	const revisar = () => {
		pendiente = false;
		const lista = [...new Set(archivos().map((t) => t.closest('.panel-tab') || t))];
		if (Date.now() > hasta) {
			tenias = lista.length;
			return;
		}
		if (tenias == null || lista.length <= tenias) return;
		// las sobrantes (las más nuevas van al final)
		for (const t of lista.slice(tenias)) {
			const nombre = t.textContent.trim();
			const cerrar = (t.parentElement || t).querySelector(
				`button[aria-label='Cerrar ${CSS.escape(nombre)}'], button[aria-label='Close ${CSS.escape(nombre)}']`
			);
			cerrar?.click();
		}
	};

	const programar = () => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(revisar);
	};

	cortes.forEach((m) =>
		m.addEventListener('change', () => {
			hasta = Date.now() + 2500;
			programar();
		})
	);
	skVigilar(programar, { childList: true, subtree: true });
	programar();
})();

/*
 * Modo voz, detalles del lienzo "2 · Azul y negro (rojo solo al silenciar)":
 *  - el nombre del modelo debajo del avatar ("Sakura", 26 px);
 *  - mientras responde, el inicio de lo que está diciendo entre comillas («¡Qué bueno escucharte…») sobre
 *    "Toca para interrumpir";
 *  - en el teléfono, la cabecera "‹ Chat · Modo voz" en lugar de la fila de pestañas del cajón; "‹ Chat" lo cierra y
 *    vuelve al chat (la llamada sigue).
 */
(() => {
	let pendiente = false;
	const telefono = window.matchMedia('(max-width: 767px)');
	// "Modo voz" con el estado y el tiempo de la llamada debajo ("● Escuchando · 0:42")
	const ESTADOS = { escuchando: 'Escuchando', pensando: 'Pensando', respondiendo: 'Respondiendo', silenciado: 'Silenciado' };
	const TITULO = '<div class="sk-voz-titulo"><b>Modo voz</b><small data-estado="escuchando"><i></i><span></span></small></div>';
	let inicio = 0;
	let reloj = null;
	const tiempo = () => {
		const s = Math.max(0, Math.floor((Date.now() - inicio) / 1000));
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};
	const pintarTitulos = () => {
		const boton = document.querySelector('.sk-voz-boton');
		const estado = Object.keys(ESTADOS).find((e) => boton?.classList.contains(`sk-voz-${e}`)) || 'escuchando';
		document.querySelectorAll('.sk-voz-titulo small').forEach((s) => {
			if (s.dataset.estado !== estado) s.dataset.estado = estado;
			const texto = `${ESTADOS[estado]} · ${tiempo()}`;
			const span = s.querySelector('span');
			if (span.textContent !== texto) span.textContent = texto;
		});
	};

	const nombreModelo = () => {
		const b = document.querySelector("#message-input-container button[aria-label^='Modelo selecc']");
		const n = b?.getAttribute('aria-label')?.split(':').slice(1).join(':').trim();
		return n || [...document.querySelectorAll('#response-message-model-name')].at(-1)?.textContent.trim() || '';
	};

	const cita = () => {
		const t = [...document.querySelectorAll('.chat-assistant #response-content-container .markdown-prose')].at(-1)?.textContent.replace(/\s+/g, ' ').trim() || '';
		if (!t) return '';
		if (t.length <= 90) return `«${t}»`;
		const corte = t.slice(0, 90);
		return `«${corte.slice(0, corte.lastIndexOf(' ') > 40 ? corte.lastIndexOf(' ') : 90)}…»`;
	};

	const actualizar = () => {
		pendiente = false;
		// tiempo de la llamada: desde que aparece el modo voz
		const hayVoz = Boolean(document.querySelector('.sk-voz-boton'));
		// la imagen de fondo del chat, para el vidrio del modo voz en el teléfono (como en el lienzo)
		const fondo = document.querySelector('div.bg-cover.bg-no-repeat.pointer-events-none')?.style.backgroundImage || '';
		if (fondo && document.documentElement.style.getPropertyValue('--sk-fondo-chat') !== fondo) {
			document.documentElement.style.setProperty('--sk-fondo-chat', fondo);
		}
		if (hayVoz && !inicio) {
			inicio = Date.now();
			reloj = setInterval(pintarTitulos, 1000);
		} else if (!hayVoz && inicio) {
			inicio = 0;
			clearInterval(reloj);
		}
		document.querySelectorAll('.sk-voz-boton').forEach((boton) => {
			const escena = boton.querySelector(':scope > .sk-voz-escena');
			if (!escena) return;
			let n = escena.querySelector(':scope > .sk-voz-nombre');
			if (!n) {
				n = document.createElement('span');
				n.className = 'sk-voz-nombre';
				escena.appendChild(n);
			}
			const nombre = nombreModelo();
			if (n.textContent !== nombre) n.textContent = nombre;
		});
		document.querySelectorAll("[role='status'][aria-live][data-sk-voz]").forEach((caja) => {
			let c = caja.querySelector(':scope > .sk-voz-cita');
			if (!c) {
				c = document.createElement('div');
				c.className = 'sk-voz-cita';
				caja.insertBefore(c, caja.querySelector(':scope > button'));
			}
			const texto = caja.dataset.skVoz === 'respondiendo' ? cita() : '';
			if (c.textContent !== texto) c.textContent = texto;
		});

		// cabecera del teléfono
		const dlg = document.querySelector(".modal[role='dialog'][aria-label='Pestañas'], .modal[role='dialog'][aria-label='Tabs']");
		const voz = dlg?.querySelector('.sk-voz-boton');
		const conVoz = Boolean(telefono.matches && voz && voz.offsetParent);
		if (dlg) {
			if (dlg.classList.contains('sk-voz-movil') !== conVoz) dlg.classList.toggle('sk-voz-movil', conVoz);
			// queda marcada mientras exista: al salir, el contenido de la llamada se va antes que la ventana y su fondo
			// oscuro de Open WebUI se alcanzaba a ver (carbono.css lo quita en [data-sk-fue-voz])
			if (conVoz && !dlg.hasAttribute('data-sk-fue-voz')) dlg.setAttribute('data-sk-fue-voz', '');
			const columna = dlg.querySelector('#controls-container')?.parentElement;
			let cab = columna?.querySelector(':scope > .sk-voz-cabeza');
			if (conVoz && columna && !cab) {
				cab = document.createElement('div');
				cab.className = 'sk-voz-cabeza';
				cab.innerHTML =
					'<button type="button" aria-label="Volver al chat"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>Chat</button>' +
					TITULO;
				cab.querySelector('button').addEventListener('click', () =>
					dlg.querySelector("button[aria-label='Ocultar pestañas'], button[aria-label='Hide tabs']")?.click()
				);
				columna.prepend(cab);
			} else if (!conVoz) cab?.remove();
		}

		// escritorio: el título "Modo voz" arriba del panel de voz (la conversación ya se ve al lado)
		document.querySelectorAll("[role='tabpanel']:has(.sk-voz-boton)").forEach((panel) => {
			const enCajon = Boolean(panel.closest(".modal[role='dialog']"));
			let t = panel.querySelector(':scope > .sk-voz-cabeza-panel');
			if (enCajon) return t?.remove();
			if (!t) {
				t = document.createElement('div');
				t.className = 'sk-voz-cabeza sk-voz-cabeza-panel';
				t.innerHTML = TITULO;
				panel.prepend(t);
			}
		});
		pintarTitulos();
	};

	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}, { childList: true, subtree: true, characterData: true });
	telefono.addEventListener('change', actualizar);
})();

/*
 * Selector de modelo de la barra lateral (lienzo "Selector de modelo abierto · escritorio / móvil"): al tocar la tarjeta
 * "Modelo activo" se abre debajo un panel con buscador ("Buscar entre 10 modelos"), los modelos fijados y todos los
 * demás. Cada renglón: avatar (o una letra si el modelo no tiene foto), nombre, tipo (Personaje, Modelo base · local,
 * Conexión externa, Desactivado…), chincheta para fijar o quitar de la barra y palomita en el activo.
 * Elegir un modelo y fijarlo se hace con el selector de Open WebUI (se abre sin verse y se toca la opción), así que
 * todo queda guardado igual que siempre.
 */
(() => {
	let panel = null;
	let modelos = null;
	let ancla = null;
	const headers = () => ({ Authorization: `Bearer ${localStorage.token || ''}` });
	const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
	const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
	const svg = (d, tam = 15, extra = '') =>
		`<svg viewBox="0 0 24 24" width="${tam}" height="${tam}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
	const CHINCHETA = '<path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/>';
	const avatar = (id) => `/api/v1/models/model/profile/image?id=${encodeURIComponent(id)}`;
	const espera = (ms) => new Promise((r) => setTimeout(r, ms));

	const cargar = async () => {
		if (modelos) return modelos;
		try {
			const r = await fetch('/api/models', { headers: headers() });
			const d = await r.json();
			modelos = (d.data || d || []).map((m) => {
				const meta = m.info?.meta || {};
				const propio = Boolean(m.info?.base_model_id);
				let tipo = propio ? 'Personaje' : m.connection_type === 'local' ? 'Modelo base · local' : 'Conexión externa';
				let apagado = false;
				if (m.info && m.info.is_active === false) {
					tipo = 'Desactivado';
					apagado = true;
				} else if (meta.hidden) {
					tipo = 'Oculto';
					apagado = true;
				}
				return { id: m.id, nombre: m.name || m.id, tipo, apagado, foto: propio || Boolean(meta.profile_image_url) };
			});
		} catch {
			modelos = [];
		}
		return modelos;
	};

	const activo = () => {
		const img = document.querySelector("#message-input-container :is(button, [aria-label^='Modelo']) img[src*='/models/model/profile/image']");
		try {
			return img ? new URL(img.getAttribute('src'), location.origin).searchParams.get('id') : null;
		} catch {
			return null;
		}
	};
	const fijados = () => [...document.querySelectorAll('#pinned-models-list [data-id]')].map((e) => e.dataset.id);

	// abre el selector de Open WebUI sin que se vea, hace algo y lo cierra
	const conSelectorOculto = async (accion) => {
		const boton = document.querySelector("#message-input-container button[aria-label^='Modelo selecc']");
		if (!boton) return false;
		document.documentElement.classList.add('sk-selector-oculto');
		try {
			boton.click();
			let lista = null;
			for (let i = 0; i < 25 && !lista; i++) {
				await espera(40);
				lista = document.querySelector("[role='listbox']:has(button[data-value])");
			}
			if (!lista) return false;
			const hecho = await accion(lista);
			// al elegir, Open WebUI la cierra solo (con su animación de salida): se espera sin verla. Si sigue abierta
			// (por ejemplo después de fijar), se cierra con Escape.
			const abierta = () => document.querySelector("[role='listbox']:has(button[data-value])");
			for (let i = 0; i < 30 && abierta(); i++) {
				await espera(60);
				if (i === 4 && abierta()) {
					document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
					abierta()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
				}
			}
			return hecho;
		} finally {
			setTimeout(() => document.documentElement.classList.remove('sk-selector-oculto'), 200);
		}
	};

	const elegir = async (id) => {
		const hecho = await conSelectorOculto(async (lista) => {
			const op = [...lista.querySelectorAll('button[data-value]')].find((b) => b.dataset.value === id);
			if (!op) return false;
			op.click();
			return true;
		});
		if (!hecho && !document.querySelector('#message-input-container')) location.href = `/?model=${encodeURIComponent(id)}`;
		cerrar();
	};

	const fijar = async (id) => {
		await conSelectorOculto(async (lista) => {
			const op = [...lista.querySelectorAll('button[data-value]')].find((b) => b.dataset.value === id);
			// el "Más Opciones" de ese mismo renglón (Open WebUI lo pone dentro del botón del modelo)
			const mas = op?.querySelector("button[aria-label='Más Opciones'], button[aria-label='More Options']");
			if (!mas) return false;
			mas.click();
			for (let i = 0; i < 25; i++) {
				await espera(40);
				const item = [...document.querySelectorAll("[role='menu'] :is(button, [role='menuitem'])")].find((b) =>
					/panel lateral|barra lateral|sidebar/i.test(b.textContent)
				);
				if (item) {
					item.click();
					return true;
				}
			}
			return false;
		});
		setTimeout(pintar, 300);
	};

	const renglon = (m, esActivo, fijado) => {
		const c = window.skColorModelo?.(m.id);
		const color = c ? `hsl(${c.m})` : '#52525b';
		const imagen = m.foto
			? `<img alt="" src="${avatar(m.id)}">`
			: `<span class="sk-sel-letra">${esc((m.nombre.match(/[a-z0-9]/i) || ['?'])[0].toUpperCase())}</span>`;
		const sub = esActivo ? 'Activo' : fijado && m.tipo === 'Personaje' ? '' : m.tipo;
		return `<div class="sk-sel-fila${esActivo ? ' sk-activo' : ''}${m.apagado ? ' sk-apagado' : ''}" role="option" aria-selected="${esActivo}" data-id="${esc(m.id)}" tabindex="${m.apagado ? -1 : 0}" style="--sk-sel-color:${color}">
			${imagen}
			<span class="sk-sel-texto"><b>${esc(m.nombre)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</span>
			<button type="button" class="sk-sel-fijar${fijado ? ' sk-fijado' : ''}" data-fijar="${esc(m.id)}" aria-label="${fijado ? 'Quitar de fijados' : 'Fijar en la barra'}: ${esc(m.nombre)}" title="${fijado ? 'Quitar de fijados' : 'Fijar en la barra'}">${svg(CHINCHETA, 14, fijado ? ' fill="currentColor"' : '')}</button>
			<span class="sk-sel-marca" aria-hidden="true">${esActivo ? svg('<path d="M5 12l5 5 9-10"/>', 16) : ''}</span>
		</div>`;
	};

	const pintar = () => {
		if (!panel || !modelos) return;
		const q = panel.querySelector('input').value.trim().toLowerCase();
		const act = activo();
		const fij = fijados();
		const visibles = modelos.filter((m) => !q || m.nombre.toLowerCase().includes(q) || m.id.toLowerCase().includes(q));
		const arriba = fij.map((id) => visibles.find((m) => m.id === id)).filter(Boolean);
		const abajo = visibles.filter((m) => !fij.includes(m.id));
		const seccion = (titulo, lista) =>
			lista.length ? `<div class="sk-sel-rotulo"><span>${titulo}</span><span>${lista.length}</span></div>${lista.map((m) => renglon(m, m.id === act, fij.includes(m.id))).join('')}` : '';
		panel.querySelector('.sk-sel-lista').innerHTML =
			seccion('Fijados', arriba) + seccion('Todos los modelos', abajo) || '<div class="sk-sel-vacio">Ningún modelo coincide</div>';
	};

	const cerrar = () => {
		if (!panel) return;
		panel.remove();
		panel = null;
		ancla?.setAttribute('aria-expanded', 'false');
		document.removeEventListener('pointerdown', fuera, true);
		document.removeEventListener('keydown', teclas, true);
	};
	const fuera = (e) => {
		if (document.documentElement.classList.contains('sk-selector-oculto')) return;
		if (panel && !panel.contains(e.target) && !ancla?.contains(e.target)) cerrar();
	};
	const teclas = (e) => {
		// el Escape que mandamos al selector oculto de Open WebUI no cierra el panel
		if (!e.isTrusted) return;
		if (e.key === 'Escape' && panel) {
			e.stopPropagation();
			cerrar();
			ancla?.focus();
		}
	};

	const abrir = async (boton) => {
		ancla = boton;
		const lista = await cargar();
		panel = document.createElement('div');
		panel.className = 'sk-selector';
		panel.setAttribute('role', 'dialog');
		panel.setAttribute('aria-label', 'Elegir modelo');
		panel.innerHTML = `
			<div class="sk-sel-titulo">Elegir modelo</div>
			<label class="sk-sel-buscar">${svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>', 15)}<input type="search" placeholder="Buscar entre ${lista.length} modelos" aria-label="Buscar modelo"></label>
			<div class="sk-sel-lista" role="listbox" aria-label="Modelos"></div>`;
		panel.querySelector('input').addEventListener('input', pintar);
		panel.addEventListener('click', (e) => {
			const pin = e.target.closest('[data-fijar]');
			if (pin) {
				e.stopPropagation();
				fijar(pin.dataset.fijar);
				return;
			}
			const fila = e.target.closest('.sk-sel-fila:not(.sk-apagado)');
			if (fila) elegir(fila.dataset.id);
		});
		panel.addEventListener('keydown', (e) => {
			const fila = e.target.closest?.('.sk-sel-fila');
			if (fila && (e.key === 'Enter' || e.key === ' ') && e.target === fila) {
				e.preventDefault();
				if (!fila.classList.contains('sk-apagado')) elegir(fila.dataset.id);
			}
			if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
				const filas = [...panel.querySelectorAll('.sk-sel-fila:not(.sk-apagado)')];
				const i = filas.indexOf(document.activeElement);
				const sig = filas[(i + (e.key === 'ArrowDown' ? 1 : -1) + filas.length) % filas.length];
				if (sig) {
					e.preventDefault();
					sig.focus();
				}
			}
		});
		const extra = boton.closest('.sk-barra-extra');
		(extra?.parentElement || document.body).appendChild(panel);
		const r = boton.getBoundingClientRect();
		const caja = panel.parentElement.getBoundingClientRect();
		const arriba = r.bottom - caja.top + 6;
		panel.style.top = `${arriba}px`;
		panel.style.maxHeight = `${Math.max(240, caja.height - arriba - 80)}px`;
		firma = `${activo()}|${fijados().join(',')}`;
		boton.setAttribute('aria-expanded', 'true');
		pintar();
		panel.querySelector('input').focus({ preventScroll: true });
		document.addEventListener('pointerdown', fuera, true);
		document.addEventListener('keydown', teclas, true);
	};

	window.skSelectorModelo = {
		alternar: (boton) => (panel ? cerrar() : abrir(boton))
	};

	// si cambia la lista de fijados o el modelo activo con el panel abierto, se vuelve a pintar (solo entonces, para no
	// entrar en un ciclo con el propio panel)
	let firma = '';
	let pendiente = false;
	skVigilar(() => {
		if (!panel || pendiente) return;
		pendiente = true;
		requestAnimationFrame(() => {
			pendiente = false;
			const f = `${activo()}|${fijados().join(',')}`;
			if (f !== firma) {
				firma = f;
				pintar();
			}
		});
	}, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
})();

/*
 * Íconos de modelos en WebP: Open WebUI ya convierte los PNG y JPG que subes como ícono de un modelo a WebP de 250 × 250,
 * pero las WebP las guarda tal cual (para no romper las animadas), aunque pesen megas. Aquí, si la imagen elegida es
 * una WebP fija (sin animación), antes de que Open WebUI la lea se pasa a PNG del mismo tamaño para que haga su
 * recorte normal a WebP de 250 × 250. Las WebP y GIF animadas no se tocan.
 */
(() => {
	const PAGINAS = /^\/(workspace\/models|admin\/settings\/models)/;
	const ES_ICONO = "input[type='file'][accept='image/*']";
	// una WebP animada lleva el bloque "ANIM" en su cabecera
	const animada = async (archivo) => {
		const cabeza = new Uint8Array(await archivo.slice(0, 64).arrayBuffer());
		return new TextDecoder('latin1').decode(cabeza).includes('ANIM');
	};
	const aPng = async (archivo) => {
		const mapa = await createImageBitmap(archivo);
		const lienzo = document.createElement('canvas');
		lienzo.width = mapa.width;
		lienzo.height = mapa.height;
		lienzo.getContext('2d').drawImage(mapa, 0, 0);
		mapa.close?.();
		const blob = await new Promise((listo) => lienzo.toBlob(listo, 'image/png'));
		return new File([blob], archivo.name.replace(/\.webp$/i, '') + '.png', { type: 'image/png' });
	};
	document.addEventListener(
		'change',
		async (e) => {
			const input = e.target;
			if (!(input instanceof HTMLInputElement) || !input.matches(ES_ICONO) || !PAGINAS.test(location.pathname)) return;
			if (input.dataset.skConvertido) {
				delete input.dataset.skConvertido;
				return;
			}
			const archivo = input.files?.[0];
			if (!archivo || archivo.type !== 'image/webp') return;
			e.stopImmediatePropagation();
			let final = archivo;
			try {
				if (!(await animada(archivo))) final = await aPng(archivo);
			} catch (error) {
				console.error('[sakura] ícono del modelo', error);
			}
			const lista = new DataTransfer();
			lista.items.add(final);
			input.files = lista.files;
			input.dataset.skConvertido = '1';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			input.dispatchEvent(new Event('change', { bubbles: true }));
		},
		true
	);
})();

/*
 * Chat temporal activo: Open WebUI cambia el ícono de su botón a una burbuja con palomita. Se marca <html> con
 * .sk-chat-temporal para la franja "Chat temporal · no se guarda en tu historial" (antes era html:has(...) en el CSS,
 * que obligaba al navegador a revisar toda la página en cada cambio del chat).
 */
(() => {
	const raiz = document.documentElement;
	let pendiente = false;
	const revisar = () => {
		pendiente = false;
		const activo = !!document.querySelector("#temporary-chat-button path[d^='M8 12L11 15']");
		if (raiz.classList.contains('sk-chat-temporal') !== activo) raiz.classList.toggle('sk-chat-temporal', activo);
	};
	skVigilar(
		() => {
			if (pendiente) return;
			pendiente = true;
			requestAnimationFrame(revisar);
		},
		{ childList: true, subtree: true }
	);
	revisar();
})();

/*
 * Botón "Modo de Voz" de la caja de mensaje como interruptor: con la llamada en curso, tocarlo otra vez la termina
 * (Open WebUI no hacía nada). Mientras dura lleva un aro del color del modelo, aria-pressed y el título
 * "Terminar modo voz".
 */
(() => {
	const BOTON = ":is(#message-input-container, [id^='side-chat-input-'][id$='-wrapper']) button:is([aria-label='Modo de Voz'], [aria-label='Voice mode'])";
	const FIN = ":is(button[aria-label='Finalizar llamada'], button[aria-label='End call'])";
	const finTab = () => document.querySelector(`.panel-tab ${FIN}`);
	const enCurso = () => Boolean(finTab() || document.querySelector('.sk-voz-boton'));
	let pendiente = false;

	const marcar = () => {
		pendiente = false;
		const activo = enCurso();
		document.querySelectorAll(BOTON).forEach((b) => {
			if (b.classList.contains('sk-voz-en-curso') === activo) return;
			b.classList.toggle('sk-voz-en-curso', activo);
			b.setAttribute('aria-pressed', String(activo));
			if (activo) {
				if (!b.dataset.skTitulo) b.dataset.skTitulo = b.getAttribute('title') || '';
				b.setAttribute('title', 'Terminar modo voz');
			} else if (b.dataset.skTitulo !== undefined) {
				b.setAttribute('title', b.dataset.skTitulo);
			}
		});
	};

	document.addEventListener(
		'click',
		(e) => {
			const b = e.target.closest?.(BOTON);
			if (!b || !enCurso()) return;
			// la X de la pestaña Voz o, si no hay pestaña (cajón del teléfono), el botón Finalizar del modo voz
			const fin = finTab() || document.querySelector(`.sk-voz-boton ~ * ${FIN}, [role='tabpanel'] ${FIN}, .modal ${FIN}`);
			if (!fin) return;
			e.preventDefault();
			e.stopImmediatePropagation();
			fin.click();
		},
		true
	);

	skVigilar(
		() => {
			if (pendiente) return;
			pendiente = true;
			requestAnimationFrame(marcar);
		},
		{ childList: true, subtree: true }
	);
	marcar();
})();

/*
 * "Editar mensaje" (lienzos "Mensaje en vidrio · editar mensaje" y "Editar mensaje · escritorio y móvil"): mientras
 * editas un mensaje tuyo, la tarjeta dice quién volverá a responder ("Lain volverá a responder desde aquí"), las
 * respuestas que vienen después se atenúan con la nota "Esta respuesta se reemplazará al guardar" y la caja de
 * mensaje de abajo se atenúa. <html> lleva .sk-editando mientras dura.
 */
(() => {
	const raiz = document.documentElement;
	let pendiente = false;
	const revisar = () => {
		pendiente = false;
		const campo = document.querySelector("#messages-container textarea[id^='message-edit-']");
		const mensaje = campo?.closest('.user-message');
		const editando = Boolean(mensaje);
		if (raiz.classList.contains('sk-editando') !== editando) raiz.classList.toggle('sk-editando', editando);
		const marcados = new Set();
		if (mensaje) {
			const caja = campo.closest('.rounded-3xl') || campo.parentElement;
			// las respuestas que vienen después de tu mensaje (hasta el siguiente mensaje tuyo)
			const contenedor = mensaje.parentElement?.parentElement;
			const hermanos = contenedor ? [...contenedor.children] : [];
			const desde = hermanos.indexOf(mensaje.parentElement);
			let quien = '';
			for (const h of hermanos.slice(desde + 1)) {
				const m = h.querySelector(':scope [id^="message-"]') || (h.id?.startsWith('message-') ? h : null);
				if (!m) continue;
				if (m.classList.contains('user-message')) break;
				if (!quien) quien = m.querySelector('#response-message-model-name')?.textContent.trim() || '';
				marcados.add(m);
			}
			const texto = quien ? `${quien} volverá a responder desde aquí` : 'Volverá a responder desde aquí';
			// el CSS lo pinta en la fila de los botones con content: var(--sk-responde)
			const valor = JSON.stringify(texto);
			if (caja && caja.style.getPropertyValue('--sk-responde') !== valor) caja.style.setProperty('--sk-responde', valor);
		}
		document.querySelectorAll('.sk-se-reemplaza').forEach((m) => marcados.has(m) || m.classList.remove('sk-se-reemplaza', 'sk-se-reemplaza-nota'));
		let primero = true;
		marcados.forEach((m) => {
			if (!m.classList.contains('sk-se-reemplaza')) m.classList.add('sk-se-reemplaza');
			if (m.classList.contains('sk-se-reemplaza-nota') !== primero) m.classList.toggle('sk-se-reemplaza-nota', primero);
			primero = false;
		});
	};
	skVigilar(
		() => {
			if (pendiente) return;
			pendiente = true;
			requestAnimationFrame(revisar);
		},
		{ childList: true, subtree: true }
	);
})();

/*
 * Final del chat en el teléfono: si ya estás abajo del todo y sigues empujando hacia arriba, la lista se estira con
 * resistencia (al principio sigue al dedo y cada vez cuesta más, hasta ~80 px) y al soltar vuelve despacio a su sitio
 * (0.7 s, sin brincos); así se nota que no hay más. Se mueve la lista entera y no su contenido: mover el contenido le
 * quitaba altura desplazable y al soltar el final del chat quedaba tapado por la caja de mensaje. Solo en el teléfono
 * y sin la preferencia de reducir el movimiento.
 */
(() => {
	const telefono = window.matchMedia('(max-width: 767px)');
	const quieto = window.matchMedia('(prefers-reduced-motion: reduce)');
	const LIMITE = 80;
	let lista = null;
	let base = null;
	let tirando = false;

	const alFinal = (sc) => sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2;
	const mover = (d, suave) => {
		lista.style.transition = suave ? 'transform 0.7s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
		lista.style.transform = d ? `translateY(${-d.toFixed(1)}px)` : '';
	};
	const soltar = () => {
		if (lista && tirando) {
			mover(0, true);
			const sc = lista;
			setTimeout(() => {
				if (!tirando && sc.style.transform === '') sc.style.transition = '';
			}, 720);
		}
		tirando = false;
		base = null;
	};

	document.addEventListener(
		'touchstart',
		(e) => {
			if (tirando) soltar();
			lista = telefono.matches && !quieto.matches ? e.target.closest?.('#messages-container') : null;
			base = null;
		},
		{ passive: true }
	);

	document.addEventListener(
		'touchmove',
		(e) => {
			if (!lista || e.touches.length !== 1) return;
			const y = e.touches[0].clientY;
			if (!alFinal(lista)) {
				if (tirando) soltar();
				return;
			}
			// la referencia es el punto donde se llegó al final, no donde empezó el gesto
			if (base === null) base = y;
			const empuje = base - y; // dedo hacia arriba = quieres seguir bajando
			if (empuje <= 0) {
				if (tirando) {
					mover(0, false);
					tirando = false;
				}
				base = Math.max(base, y);
				return;
			}
			tirando = true;
			// resistencia tipo goma: casi 1:2 al principio y cada vez más dura hasta el límite
			const d = LIMITE * (1 - 1 / (1 + (empuje * 0.55) / LIMITE));
			mover(d, false);
		},
		{ passive: true }
	);

	document.addEventListener('touchend', soltar, { passive: true });
	document.addEventListener('touchcancel', soltar, { passive: true });
})();

/*
 * Visor de imágenes (el de Open WebUI) con zoom que no se sale de la imagen:
 *  - la X cierra al poner el dedo y el clic que el navegador manda al levantarlo caía en la imagen del chat de
 *    atrás y la volvía a abrir; ahora ese clic se descarta;
 *  - la librería de Open WebUI (panzoom) dejaba arrastrar la imagen fuera de la pantalla hasta perderla y alejarla por
 *    debajo de su tamaño. El tema toma los gestos dentro del visor: pellizco o rueda para acercar (1× a 5×), arrastre
 *    solo con zoom y siempre con la imagen cubriendo la pantalla (si es más chica que la pantalla, centrada), doble
 *    toque o doble clic para acercar a 2.5× y volver.
 */
(() => {
	const VISOR = ".modal[role='dialog'][aria-modal='true'].bg-black";
	const MAX = 5;
	const estados = new WeakMap(); // img → { s, tx, ty }
	const punteros = new Map(); // pointerId → { x, y }
	let gesto = null;
	let ultimoToque = { t: 0, x: 0, y: 0 };

	const enVisor = (e) => {
		const modal = e.target?.closest?.(VISOR);
		return modal && !e.target.closest('button') ? modal : null;
	};
	const imagen = (modal) => modal?.querySelector('img');
	const estado = (img) => {
		let s = estados.get(img);
		if (!s) {
			s = { s: 1, tx: 0, ty: 0 };
			estados.set(img, s);
		}
		return s;
	};

	// tamaño dibujado de la imagen (object-fit contain / scale-down) y centro de su caja sin la transformación
	const medidas = (img, st) => {
		// se mide con la transformación que está pintada (no con la nueva que se está calculando)
		const p = st.p || { s: 1, tx: 0, ty: 0 };
		const r = img.getBoundingClientRect();
		const bw = r.width / p.s;
		const bh = r.height / p.s;
		let dw = bw;
		let dh = bh;
		if (img.naturalWidth && img.naturalHeight) {
			const ajuste = getComputedStyle(img).objectFit;
			if (ajuste === 'contain' || ajuste === 'scale-down') {
				let k = Math.min(bw / img.naturalWidth, bh / img.naturalHeight);
				if (ajuste === 'scale-down') k = Math.min(k, 1);
				dw = img.naturalWidth * k;
				dh = img.naturalHeight * k;
			}
		}
		return { cx: r.left + r.width / 2 - p.tx, cy: r.top + r.height / 2 - p.ty, dw, dh };
	};

	const limitar = (img, st) => {
		st.s = Math.min(MAX, Math.max(1, st.s));
		if (st.s === 1) {
			st.tx = 0;
			st.ty = 0;
			return;
		}
		const { cx, cy, dw, dh } = medidas(img, st);
		const eje = (t, c, d, v) => {
			const ancho = d * st.s;
			if (ancho <= v) return v / 2 - c; // más chica que la pantalla: centrada
			return Math.min(ancho / 2 - c, Math.max(v - c - ancho / 2, t));
		};
		st.tx = eje(st.tx, cx, dw, window.innerWidth);
		st.ty = eje(st.ty, cy, dh, window.innerHeight);
	};

	const pintar = (img, st, suave) => {
		img.style.transformOrigin = '50% 50%';
		img.style.transition = suave ? 'transform 0.25s ease' : 'none';
		img.style.transform = st.s === 1 && !st.tx && !st.ty ? '' : `translate(${st.tx}px, ${st.ty}px) scale(${st.s})`;
		st.p = { s: st.s, tx: st.tx, ty: st.ty };
	};

	// acercar o alejar alrededor de un punto de la pantalla
	const zoomEn = (img, st, nuevo, px, py) => {
		const { cx, cy } = medidas(img, st);
		const qx = (px - cx - st.tx) / st.s;
		const qy = (py - cy - st.ty) / st.s;
		st.s = Math.min(MAX, Math.max(1, nuevo));
		st.tx = px - cx - st.s * qx;
		st.ty = py - cy - st.s * qy;
		limitar(img, st);
	};

	// la librería de Open WebUI escucha ratón, toques, rueda y doble clic: dentro del visor no le llegan
	for (const tipo of ['mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'dblclick', 'wheel']) {
		window.addEventListener(
			tipo,
			(e) => {
				const modal = enVisor(e);
				if (!modal) return;
				e.stopImmediatePropagation();
				if (tipo === 'touchmove' || tipo === 'wheel') e.preventDefault();
				const img = imagen(modal);
				if (!img) return;
				const st = estado(img);
				if (tipo === 'wheel') {
					zoomEn(img, st, st.s * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
					pintar(img, st, false);
				} else if (tipo === 'dblclick') {
					zoomEn(img, st, st.s > 1.05 ? 1 : 2.5, e.clientX, e.clientY);
					pintar(img, st, true);
				}
			},
			{ capture: true, passive: false }
		);
	}

	window.addEventListener(
		'pointerdown',
		(e) => {
			const modal = e.target?.closest?.(VISOR);
			if (!modal) return;
			// la X del visor: descartar el clic que llega al levantar el dedo
			const cerrar = modal.querySelector(':scope > div:first-child button');
			if (cerrar && cerrar.contains(e.target)) {
				const tragar = (ev) => {
					ev.preventDefault();
					ev.stopImmediatePropagation();
				};
				document.addEventListener('click', tragar, { capture: true, once: true });
				setTimeout(() => document.removeEventListener('click', tragar, true), 700);
				return;
			}
			if (e.target.closest('button')) return;
			const img = imagen(modal);
			if (!img) return;
			punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
			const st = estado(img);
			const lista = [...punteros.values()];
			if (lista.length === 2) {
				const [a, b] = lista;
				gesto = { img, tipo: 'pellizco', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: st.s };
			} else if (lista.length === 1) {
				gesto = { img, tipo: 'arrastre', x: e.clientX, y: e.clientY, tx: st.tx, ty: st.ty };
				// doble toque en el teléfono (el doble clic del navegador no llega con los toques)
				if (e.pointerType === 'touch') {
					const ahora = Date.now();
					if (ahora - ultimoToque.t < 300 && Math.hypot(e.clientX - ultimoToque.x, e.clientY - ultimoToque.y) < 30) {
						zoomEn(img, st, st.s > 1.05 ? 1 : 2.5, e.clientX, e.clientY);
						pintar(img, st, true);
						gesto = null;
						ultimoToque = { t: 0, x: 0, y: 0 };
						return;
					}
					ultimoToque = { t: ahora, x: e.clientX, y: e.clientY };
				}
			}
		},
		true
	);

	window.addEventListener(
		'pointermove',
		(e) => {
			if (!gesto || !punteros.has(e.pointerId)) return;
			punteros.set(e.pointerId, { x: e.clientX, y: e.clientY });
			const { img } = gesto;
			if (!img.isConnected) return;
			const st = estado(img);
			const lista = [...punteros.values()];
			if (gesto.tipo === 'pellizco' && lista.length >= 2) {
				const [a, b] = lista;
				const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
				zoomEn(img, st, gesto.s0 * (d / gesto.d0), (a.x + b.x) / 2, (a.y + b.y) / 2);
				pintar(img, st, false);
			} else if (gesto.tipo === 'arrastre' && st.s > 1) {
				st.tx = gesto.tx + (e.clientX - gesto.x);
				st.ty = gesto.ty + (e.clientY - gesto.y);
				limitar(img, st);
				pintar(img, st, false);
			}
		},
		true
	);

	const fin = (e) => {
		punteros.delete(e.pointerId);
		if (!gesto) return;
		const { img } = gesto;
		const lista = [...punteros.values()];
		if (lista.length === 1 && img.isConnected) {
			// de pellizco a un dedo: sigue como arrastre desde donde quedó
			const st = estado(img);
			gesto = { img, tipo: 'arrastre', x: lista[0].x, y: lista[0].y, tx: st.tx, ty: st.ty };
		} else if (!lista.length) {
			gesto = null;
		}
	};
	window.addEventListener('pointerup', fin, true);
	window.addEventListener('pointercancel', fin, true);
})();

/*
 * Saltos de línea en el chat: Open WebUI convierte cada salto suelto en <br> y el modelo los usa para empezar una idea
 * nueva, que quedaba pegada al renglón de arriba. Chrome no deja dar margen a un <br>, así que detrás de cada uno va un
 * span vacío (.sk-salto, 0.5em de alto en carbono.css). Si Open WebUI vuelve a pintar el párrafo y el span queda suelto,
 * se quita.
 */
(() => {
	const SALTOS = ':is(.chat-assistant, .user-message .chat-user) .markdown-prose p > br';
	let pendiente = false;
	const actualizar = () => {
		pendiente = false;
		const lista = document.getElementById('messages-container');
		if (!lista) return;
		for (const s of lista.querySelectorAll('.sk-salto')) {
			if (s.previousSibling?.nodeName !== 'BR') s.remove();
		}
		for (const br of lista.querySelectorAll(SALTOS)) {
			if (br.nextSibling?.classList?.contains('sk-salto')) continue;
			const s = document.createElement('span');
			s.className = 'sk-salto';
			s.setAttribute('aria-hidden', 'true');
			br.after(s);
		}
	};
	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	});
})();

/*
 * Teléfono: entrada de la barra lateral. Open WebUI tardaba en moverla (arma la lista de chats antes de deslizar) y la
 * barra aparecía incompleta y se completaba por partes (modelo, fijados, lista) mientras se deslizaba. Ahora, al poner
 * el dedo en "Abrir barra lateral":
 *  1. sale al instante un panel con la forma de la barra (fondo, esquinas y sombra copiados del #sidebar), con el mismo
 *     deslizamiento de 210 ms de Open WebUI; es una animación CSS de transform y se mueve fluida aunque la página esté
 *     ocupada;
 *  2. el toque normal abre la barra real, que se arma oculta (y deja pasar el toque al botón mientras tanto);
 *  3. en cuanto el panel terminó y la barra real tiene sus piezas (o a lo más 150 ms después de abrirse), la barra
 *     toma su lugar y su contenido aparece rápido (carbono.css, html[data-sk-barra='revela']).
 * Después de la primera vez la barra queda armada aunque esté cerrada: entonces no hay panel ni espera, la barra misma
 * se desliza con su contenido desde el toque (html[data-sk-barra='desliza']) y Open WebUI la da por abierta después.
 * El panel y el velo se crean una vez y quedan ocultos; al tocar solo se cambian atributos data-* que ningún módulo
 * vigila, así el toque no pone a trabajar al resto del tema.
 */
(() => {
	const telefono = matchMedia('(max-width: 767px)');
	const sinMovimiento = matchMedia('(prefers-reduced-motion: reduce)');
	const ABRIR = "button[aria-label='Abrir Barra Lateral'], button[aria-label='Open Sidebar']";
	const DESLIZA = 210;
	const raiz = document.documentElement;
	let panel = null;
	let velo = null;
	let activo = null;
	let finRevela = 0;

	const preparar = () => {
		if (panel?.isConnected || !document.body) return;
		velo = document.createElement('div');
		velo.className = 'sk-barra-velo';
		panel = document.createElement('div');
		panel.className = 'sk-barra-fantasma';
		panel.setAttribute('aria-hidden', 'true');
		document.body.append(velo, panel);
	};

	// abierta y completa: con la tarjeta del modelo, los fijados y la lista de chats; si alguna pieza no llega (sin
	// fijados, sin chats) se espera a lo más 150 ms desde que se abrió
	const lista = () => {
		const s = document.getElementById('sidebar');
		if (!s || /translateX\(-100%\)/.test(s.getAttribute('style') || '')) return false;
		activo.abierta ??= performance.now();
		const completa = s.querySelector('.sk-barra-modelo') && s.querySelector('.sk-barra-fijados') && s.querySelector('#sidebar-chat-item');
		return Boolean(completa) || performance.now() - activo.abierta > 150;
	};

	const apagar = () => {
		panel.removeAttribute('data-sk-activo');
		velo.removeAttribute('data-sk-activo');
	};

	// medidas de la barra abierta: la primera vez tras cargar la app la barra aún no existe y el panel las toma de aquí
	// (antes salía más angosto y más corto que la barra final)
	const CLAVE_MEDIDAS = 'sk-barra-medidas-2'; // -2: desde que la barra del teléfono es de pantalla completa
	const guardarSombra = () => {
		const s = document.getElementById('sidebar');
		if (!s) return;
		const cs = getComputedStyle(s);
		const sombra = cs.boxShadow;
		if (sombra && sombra !== 'none' && raiz.style.getPropertyValue('--sk-barra-sombra') !== sombra) raiz.style.setProperty('--sk-barra-sombra', sombra);
		const r = s.getBoundingClientRect();
		if (r.width < 100 || Math.abs(r.left - s.offsetLeft) > 1) return;
		try {
			localStorage.setItem(CLAVE_MEDIDAS, JSON.stringify({ l: r.left, t: r.top, w: r.width, h: r.height, vw: innerWidth, vh: innerHeight, fondo: cs.backgroundColor, radio: cs.borderRadius, sombra }));
		} catch {}
	};

	const medidasGuardadas = () => {
		try {
			const m = JSON.parse(localStorage.getItem(CLAVE_MEDIDAS) || 'null');
			return m && m.vw === innerWidth && Math.abs(m.vh - innerHeight) < 200 ? m : null;
		} catch {
			return null;
		}
	};

	const revelar = () => {
		activo = null;
		requestAnimationFrame(() => window.skAlinearFijados?.());
		setTimeout(guardarSombra, 500);
		raiz.dataset.skBarra = 'revela';
		apagar();
		clearTimeout(finRevela);
		finRevela = setTimeout(() => {
			if (raiz.dataset.skBarra === 'revela') delete raiz.dataset.skBarra;
		}, 400);
	};

	const retraer = () => {
		activo = null;
		delete raiz.dataset.skBarra;
		if (panel.dataset.skActivo) panel.dataset.skActivo = 'sale';
		velo.dataset.skActivo = 'sale';
		setTimeout(() => {
			if (!activo) apagar();
		}, 200);
	};

	// modo directo: la barra ya estaba armada y se deslizó ella misma; termina cuando Open WebUI la da por abierta
	const terminarDirecta = () => {
		activo = null;
		requestAnimationFrame(() => window.skAlinearFijados?.());
		setTimeout(guardarSombra, 500);
		delete raiz.dataset.skBarra;
		velo.removeAttribute('data-sk-activo');
	};

	// el fondo oscuro de Open WebUI ya existe (lo crea un poco después de dar la barra por abierta): hasta entonces
	// sigue el velo; quitarlo antes dejaba un instante sin fondo oscuro (parpadeo gris)
	const fondoListo = () => {
		const o = document.querySelector('div.fixed.z-40.bg-black');
		if (o && getComputedStyle(o).display === 'none') return true; // teléfono: barra de pantalla completa, sin fondo oscuro
		return Boolean(o) && parseFloat(getComputedStyle(o).opacity) >= 0.58; // ya terminó su propia entrada
	};

	const vigilar = () => {
		if (!activo) return;
		const t = performance.now() - activo.t0;
		if (activo.directa) {
			const s = document.getElementById('sidebar');
			const abierta = s && !/translateX\(-100%\)/.test(s.getAttribute('style') || '');
			if (t >= DESLIZA && abierta && fondoListo()) return terminarDirecta();
			if (t > 3000) return abierta ? terminarDirecta() : retraer();
		} else {
			if (t >= DESLIZA && lista() && fondoListo()) return revelar();
			if (t > 3000) return lista() ? revelar() : retraer();
		}
		requestAnimationFrame(vigilar);
	};

	document.addEventListener(
		'pointerdown',
		(e) => {
			if (activo || !telefono.matches || sinMovimiento.matches || !e.isPrimary || e.button > 0) return;
			const boton = e.target.closest?.(ABRIR);
			if (!boton) return;
			preparar();
			const s = document.getElementById('sidebar');
			// después de la primera vez la barra queda armada (oculta fuera de la pantalla): se desliza ella misma, con
			// todo su contenido, desde el toque. La primera vez todavía no existe: sale el panel y la barra entra al
			// estar completa.
			const directa = Boolean(s?.querySelector('.sk-barra-modelo') && s.querySelector('#sidebar-chat-item'));
			if (directa) {
				velo.dataset.skActivo = 'entra';
				raiz.dataset.skBarra = 'desliza';
				activo = { t0: performance.now(), directa: true };
			}
			const cs = s ? getComputedStyle(s) : null;
			const m = directa ? null : medidasGuardadas();
			if (!directa) Object.assign(panel.style, {
				left: `${m ? m.l : s ? s.offsetLeft : 8}px`,
				top: `${m ? m.t : s ? s.offsetTop : 8}px`,
				width: `${m ? m.w : s ? s.offsetWidth : Math.min(360, innerWidth - 44)}px`,
				height: `${m ? m.h : s ? s.offsetHeight : innerHeight}px`,
				background: m?.fondo || cs?.backgroundColor || 'var(--sk-sidebar)',
				borderRadius: m?.radio || cs?.borderRadius || '20px',
				boxShadow: m?.sombra || cs?.boxShadow || 'none'
			});
			if (!directa) {
				panel.dataset.skActivo = 'entra';
				velo.dataset.skActivo = 'entra';
				raiz.dataset.skBarra = 'cargando';
				activo = { t0: performance.now() };
			}

			// la barra la abre el toque normal de Open WebUI (abrirla desde aquí al poner el dedo fallaba la primera vez:
			// Open WebUI cambia el botón a mitad del toque). Si el toque se cancela (era un desliz) el panel se retira.
			const cancelar = (ev) => {
				if (ev.pointerId === e.pointerId && activo) retraer();
			};
			window.addEventListener('pointercancel', cancelar, { capture: true, once: true });
			setTimeout(() => window.removeEventListener('pointercancel', cancelar, true), 1500);
			requestAnimationFrame(vigilar);
		},
		true
	);

	if (document.body) preparar();
	else document.addEventListener('DOMContentLoaded', preparar, { once: true });
})();

/* Pantalla de llamada: al tocar "Modo de voz" se guarda el centro del botón para que la pantalla se abra en círculo
   desde ahí, y se marca la entrada (html[data-sk-voz-entrada]) para la cascada de la cabecera, la foto y los botones. */
(() => {
	const BOTON = "button[aria-label='Modo de Voz'], button[aria-label='Voice mode']";
	let fin = 0;
	document.addEventListener(
		'pointerdown',
		(e) => {
			const b = e.target.closest?.(BOTON);
			if (!b) return;
			const r = b.getBoundingClientRect();
			const raiz = document.documentElement;
			raiz.style.setProperty('--sk-voz-x', `${Math.round(r.left + r.width / 2)}px`);
			raiz.style.setProperty('--sk-voz-y', `${Math.round(r.top + r.height / 2)}px`);
			raiz.dataset.skVozEntrada = '';
			clearTimeout(fin);
			// la pantalla puede tardar en montarse (micrófono, conexión): la cascada espera hasta 2.5 s
			fin = setTimeout(() => delete raiz.dataset.skVozEntrada, 2500);
		},
		true
	);
})();

/* Bienvenida (chat nuevo): la foto, el nombre y "¿Cómo puedo ayudarte hoy?" aparecen quietos. Open WebUI los hace
   entrar con un fundido (animaciones creadas desde JavaScript, que CSS no puede quitar): en cuanto empiezan se dan por
   terminadas. Los pétalos son animaciones CSS y siguen igual. */
(() => {
	let hasta = 0;
	let corriendo = false;
	const finalizar = () => {
		const b = document.querySelector('.sk-bienvenida');
		if (!b) return;
		for (const a of b.getAnimations({ subtree: true })) {
			if (!(a instanceof CSSAnimation) && !(a instanceof CSSTransition)) a.finish();
		}
	};
	const bucle = () => {
		finalizar();
		if (performance.now() < hasta) requestAnimationFrame(bucle);
		else corriendo = false;
	};
	skVigilar(() => {
		if (!document.querySelector('.sk-bienvenida')) return;
		hasta = performance.now() + 900;
		finalizar();
		if (corriendo) return;
		corriendo = true;
		requestAnimationFrame(bucle);
	});
})();

/*
 * Teléfono: barra lateral del lienzo "Barra lateral móvil · diseño final". Arriba la identidad y tu cuenta (tu avatar
 * abre el menú de tu cuenta), debajo "Buscar chats" y los accesos, en medio los chats y abajo, al alcance del pulgar,
 * el modelo activo y "Nuevo chat". Los botones nuevos solo pasan el toque a los de Open WebUI y del tema (que quedan
 * ocultos), así todo sigue funcionando igual: el modelo abre el selector del tema (en hoja inferior), "Nuevo chat" y
 * "Buscar chats" tocan los de Open WebUI y el avatar abre el menú de usuario (también en hoja inferior).
 * El diseño no tiene botón de cerrar: la barra se cierra deslizando a la izquierda (o al elegir un chat, como siempre).
 */
(() => {
	const telefono = matchMedia('(max-width: 767px)');
	const LAPIZ =
		'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>';
	const FLECHA =
		'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';
	const LUPA =
		'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>';
	let pendiente = false;

	const tocar = (el) => {
		if (!el) return;
		el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerType: 'mouse' }));
		el.click();
	};

	const crear = (tag, clase, html, etiqueta) => {
		const e = document.createElement(tag);
		e.className = clase;
		if (tag === 'button') e.type = 'button';
		if (etiqueta) e.setAttribute('aria-label', etiqueta);
		e.innerHTML = html;
		return e;
	};

	// "Fijados" alineado con "Carpetas": se mide dónde empieza el texto de Carpetas y se corrige el relleno de Fijados.
	// Corre al cambiar la barra, al terminar de abrirse (carbono.js lo llama desde la entrada) y al cambiar el tamaño.
	const alinearFijados = () => {
		const s = document.getElementById('sidebar');
		const carpetas = s && [...s.querySelectorAll('#sidebar-folders-button span')].find((e) => !e.children.length && e.textContent.trim());
		const fijados = s?.querySelector('#sidebar-pinned-chats-button');
		const texto = fijados?.querySelector(':scope > div:not(:has(svg))');
		if (!carpetas || !texto || !carpetas.getClientRects().length || !texto.getClientRects().length) return;
		const delta = Math.round(carpetas.getBoundingClientRect().left - texto.getBoundingClientRect().left);
		if (!delta) return;
		const actual = parseFloat(getComputedStyle(fijados).paddingLeft) || 0;
		fijados.style.setProperty('padding-left', `${Math.max(0, actual + delta)}px`, 'important');
	};
	window.skAlinearFijados = alinearFijados;
	addEventListener('resize', () => requestAnimationFrame(alinearFijados));

	const montar = () => {
		pendiente = false;
		const s = document.getElementById('sidebar');
		const caja = s?.firstElementChild;
		if (!caja) return;

		// tu cuenta en la cabecera
		const cabeza = caja.querySelector(':scope > div.sidebar');
		const disparador = s.querySelector(".sk-barra-usuario button[aria-haspopup='true']");
		if (cabeza && disparador) {
			let cuenta = cabeza.querySelector('.sk-barra-cuenta');
			if (!cuenta) {
				cuenta = crear('button', 'sk-barra-cuenta', '<img alt=""><i aria-hidden="true"></i>', 'Tu cuenta');
				cuenta.addEventListener('click', (e) => {
					e.stopPropagation();
					tocar(s.querySelector(".sk-barra-usuario button[aria-haspopup='true']"));
				});
				const cerrar = cabeza.querySelector("button[aria-label='Cerrar Barra Lateral'], button[aria-label='Close Sidebar']");
				(cerrar?.parentElement || cabeza).insertBefore(cuenta, cerrar || null);
			}
			const src = disparador.querySelector('img')?.getAttribute('src');
			const img = cuenta.querySelector('img');
			if (src && img.getAttribute('src') !== src) img.src = src;
		}

		// "Buscar chats" arriba, fijo (en el espacio de la tarjeta del modelo)
		const extra = caja.querySelector(':scope > .sk-barra-extra');
		if (extra && !extra.querySelector('.sk-barra-buscar')) {
			const buscar = crear('button', 'sk-barra-buscar', `${LUPA}<span>Buscar chats</span><kbd>Ctrl K</kbd>`, 'Buscar chats');
			buscar.addEventListener('click', () => tocar(document.getElementById('sidebar-search-button')));
			extra.appendChild(buscar);
		}

		// abajo: modelo activo y "Nuevo chat"
		let dock = caja.querySelector(':scope > .sk-barra-dock');
		if (!dock) {
			dock = crear(
				'div',
				'sk-barra-dock',
				`<button type="button" class="sk-barra-pastilla" aria-haspopup="dialog"><img alt=""><b></b>${FLECHA}</button>` +
					`<button type="button" class="sk-barra-nuevo">${LAPIZ}<span>Nuevo chat</span></button>`
			);
			const pastilla = dock.querySelector('.sk-barra-pastilla');
			pastilla.addEventListener('click', (e) => {
				e.stopPropagation();
				window.skSelectorModelo?.alternar(pastilla);
			});
			dock.querySelector('.sk-barra-nuevo').addEventListener('click', () => document.getElementById('sidebar-new-chat-button')?.click());
			caja.appendChild(dock);
		} else if (dock !== caja.lastElementChild) caja.appendChild(dock);
		alinearFijados();

		const tarjeta = s.querySelector('.sk-barra-modelo');
		if (tarjeta) {
			const pastilla = dock.querySelector('.sk-barra-pastilla');
			const nombre = tarjeta.querySelector('.sk-barra-modelo-texto b')?.textContent.trim() || '';
			const foto = tarjeta.querySelector('img')?.getAttribute('src');
			const img = pastilla.querySelector('img');
			if (pastilla.querySelector('b').textContent !== nombre) {
				pastilla.querySelector('b').textContent = nombre;
				pastilla.setAttribute('aria-label', `Modelo activo: ${nombre}. Cambiar de modelo`);
			}
			if (foto && img.getAttribute('src') !== foto) img.src = foto;
		}
	};

	skVigilar(() => {
		if (pendiente || !document.getElementById('sidebar')) return;
		pendiente = true;
		requestAnimationFrame(montar);
	});

	// cerrar deslizando a la izquierda (teléfono): la barra sigue al dedo y al soltar termina de salir (o regresa si no
	// se deslizó lo suficiente). Se mueve con la propiedad translate, que se suma al transform de Open WebUI.
	let arrastre = null;
	const BOTON_CERRAR = "#sidebar button[aria-label='Cerrar Barra Lateral'], #sidebar button[aria-label='Close Sidebar']";
	document.addEventListener(
		'touchstart',
		(e) => {
			const s = document.getElementById('sidebar');
			arrastre = null;
			if (!telefono.matches || !s?.contains(e.target) || e.touches.length !== 1) return;
			if (/translateX\(-100%\)/.test(s.getAttribute('style') || '')) return;
			if (e.target.closest?.('.sk-selector, [role="menu"], input, textarea')) return;
			arrastre = { s, x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now(), dx: 0, modo: null };
		},
		{ passive: true, capture: true }
	);
	document.addEventListener(
		'touchmove',
		(e) => {
			const a = arrastre;
			if (!a) return;
			const dx = e.touches[0].clientX - a.x;
			const dy = e.touches[0].clientY - a.y;
			if (!a.modo && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) a.modo = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'cerrar' : 'nada';
			if (a.modo !== 'cerrar') return;
			a.dx = Math.min(0, dx);
			a.s.style.setProperty('translate', `${a.dx}px 0`);
		},
		{ passive: true, capture: true }
	);
	// la barra sale con una animación que el navegador mueve aparte (fluida aunque la página esté ocupada cargando el
	// chat); cuando Open WebUI ya la cerró se quita. Si al final no se cerró, regresa a su lugar.
	const salir = (s, desde = 0, alTerminar) => {
		if (s.skSaliendo) return;
		s.skSaliendo = true;
		const anim = s.animate([{ translate: `${desde}px 0` }, { translate: '-105vw 0' }], {
			duration: desde ? 180 : 230,
			easing: 'cubic-bezier(0.4, 0, 1, 1)',
			fill: 'forwards'
		});
		s.style.removeProperty('translate');
		anim.onfinish = () => {
			alTerminar?.();
			// se suelta solo cuando Open WebUI ya la ocultó (o a los 2 s si no llegó a cerrarse)
			const t0 = performance.now();
			const revisar = () => {
				const cerrada = /translateX\(-100%\)/.test(s.getAttribute('style') || '') && getComputedStyle(s).visibility === 'hidden';
				if (cerrada || performance.now() - t0 > 2000) {
					anim.cancel();
					s.skSaliendo = false;
				} else setTimeout(revisar, 80);
			};
			setTimeout(revisar, 80);
		};
	};

	// tocar un chat, un acceso o "Nuevo chat" cierra la barra en el teléfono: la salida empieza en el mismo toque
	document.addEventListener(
		'click',
		(e) => {
			if (!telefono.matches || e.defaultPrevented || e.button > 0) return;
			const s = document.getElementById('sidebar');
			if (!s || /translateX\(-100%\)/.test(s.getAttribute('style') || '')) return;
			const destino = e.target.closest?.('#sidebar a[href], .sk-barra-nuevo');
			if (!destino || !s.contains(destino) || e.target.closest('#sidebar-chat-item-menu, [role="menu"]')) return;
			salir(s);
		},
		true
	);

	const soltar = () => {
		const a = arrastre;
		arrastre = null;
		if (!a || a.modo !== 'cerrar') return;
		const rapido = a.dx / Math.max(1, performance.now() - a.t) < -0.5;
		if (a.dx < -70 || rapido) {
			salir(a.s, a.dx, () => document.querySelector(BOTON_CERRAR)?.click());
		} else {
			a.s.animate([{ translate: `${a.dx}px 0` }, { translate: '0 0' }], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
			a.s.style.removeProperty('translate');
		}
	};
	document.addEventListener('touchend', soltar, { passive: true, capture: true });
	document.addEventListener('touchcancel', soltar, { passive: true, capture: true });
})();

/* Tu cuenta (teléfono, diseño final): "En línea · n sesión activa" bajo tu nombre, con el número de sesiones que
   Open WebUI muestra en su globito */
(() => {
	let pendiente = false;
	skVigilar(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(() => {
			pendiente = false;
			const fila = document.querySelector("[role='menu']:has(.user-menu-status) [role='menuitem']:has(img)");
			const nombre = fila?.querySelector('div.truncate');
			if (!nombre) return;
			const n = parseInt(fila.querySelector('.bg-green-500 + span')?.textContent || '1', 10) || 1;
			const texto = `En línea · ${n} ${n === 1 ? 'sesión activa' : 'sesiones activas'}`;
			let estado = nombre.querySelector('.sk-cuenta-estado');
			if (!estado) {
				const n0 = nombre.textContent;
				nombre.textContent = '';
				const b = document.createElement('span');
				b.textContent = n0.trim();
				estado = document.createElement('span');
				estado.className = 'sk-cuenta-estado';
				nombre.append(b, estado);
			}
			if (estado.textContent !== texto) estado.textContent = texto;
		});
	});
})();

/* Escritorio: la barra abierta mide 320 px como en el lienzo "Barra escritorio · diseño final". Se aplica una sola vez
   (después puedes arrastrar el borde y Open WebUI guarda tu ancho como siempre). */
(() => {
	try {
		if (matchMedia('(min-width: 768px)').matches && !localStorage.getItem('sk-barra-320')) {
			localStorage.setItem('sidebarWidth', '320');
			document.documentElement.style.setProperty('--sidebar-width', '320px');
			localStorage.setItem('sk-barra-320', '1');
		}
	} catch {}
})();
