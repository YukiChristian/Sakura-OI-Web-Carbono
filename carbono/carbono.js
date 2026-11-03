/*
 * Carbono 0.81 — comportamiento del tema. El lanzador lo sirve en /static/loader.js
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
 * Composer: el botón de Razonamiento ("Controles del modelo", ícono de controles) se mueve a la fila
 * de chips flotantes, después de Terminal (mockups G e I). Open WebUI lo pone junto al modelo.
 */
(() => {
	const CHIPS = "#message-input-container > div[dir='ltr'] > div:nth-child(2) > div";
	const RAZONAMIENTO = "#message-input-container > div[dir='ltr'] > div:last-child > span:has(button path[d^='M10.5 6h9.75'])";
	let pendiente = false;

	const mover = () => {
		pendiente = false;
		const boton = document.querySelector(RAZONAMIENTO);
		const chips = document.querySelector(CHIPS);
		if (boton && chips) chips.appendChild(boton);
	};

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(mover);
	}).observe(document.documentElement, { childList: true, subtree: true });
})();

/*
 * Móvil (mockup L): botón "Herramientas y opciones" junto a Integraciones. Muestra cuántas opciones
 * están activas y abre una hoja de vidrio con ellas (carbono.css convierte la fila de chips de Open WebUI
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
		const activas = chips ? chips.querySelectorAll('button').length : 0;
		const texto = String(activas);
		if (boton.dataset.activas !== texto) {
			boton.dataset.activas = texto;
			boton.setAttribute('aria-label', `Herramientas y opciones, ${activas} activas`);
		}
		if (chips && chips.dataset.activas !== texto) chips.dataset.activas = texto;
	};

	document.addEventListener('keydown', (e) => {
		if (e.key === 'Escape') cerrar();
	});

	new MutationObserver(() => {
		if (pendiente) return;
		pendiente = true;
		requestAnimationFrame(actualizar);
	}).observe(document.documentElement, { childList: true, subtree: true });
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
