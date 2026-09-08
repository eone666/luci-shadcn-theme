'use strict';
'require baseclass';
'require ui';

return baseclass.extend({
	__init__() {
		ui.menu.load().then((tree) => this.render(tree));
		this.watchTables();
	},

	/*
	 * A table too wide for the screen scrolls itself, instead of pushing the
	 * whole page sideways — measured before this, Software overflowed the
	 * document by 441px at a 603px viewport, and Zones, Overview, Startup and
	 * Interfaces all did the same by less.
	 *
	 * It needs a wrapper, and the wrapper cannot come from anywhere else:
	 *
	 *   - not from the template, because the core renders views into #view long
	 *     after header.ut has run;
	 *   - not from an existing element, because no table has one to itself —
	 *     every parent also holds the section heading, the description or the
	 *     "Add" button, and Routes puts six tables in one;
	 *   - not from CSS, because overflow-x is ignored on a display:table box,
	 *     and making the table a block puts an anonymous table box inside it
	 *     that no selector can reach or stretch to the frame.
	 *
	 * Leaving the table itself display:table is what keeps it filling the width
	 * whenever it does fit.
	 */
	SCROLLER: 'table-scroller',

	wrapTables() {
		document.querySelectorAll('.table').forEach((table) => {
			const parent = table.parentNode;

			if (!parent || parent.classList?.contains(this.SCROLLER))
				return;

			const box = E('div', { 'class': this.SCROLLER });

			parent.insertBefore(box, table);
			box.appendChild(table);

			/*
			 * The shade marking a scrollable edge is hidden, at the ends, by a
			 * cover pinned to the content — so the cover has to be the colour
			 * actually behind the table. That is the page in one place and a card
			 * in another, and in the dark palette the two differ (--card is 0.205
			 * against --background's 0.145), which showed as a dark band over the
			 * Dashboard's panels. CSS cannot read what is behind an element; this
			 * can.
			 */
			for (let n = box.parentElement; n; n = n.parentElement) {
				const bg = getComputedStyle(n).backgroundColor;

				if (bg && bg != 'transparent' && bg != 'rgba(0, 0, 0, 0)') {
					box.style.setProperty('--table-cover', bg);
					break;
				}
			}
		});
	},

	watchTables() {
		this.wrapTables();

		let queued = false;

		/* Views are re-rendered on the client — navigating, and paging through
		   the package list — so this has to run again each time. Wrapping a
		   table is itself a mutation, so the work is queued once per frame
		   rather than run per event. */
		new MutationObserver(() => {
			if (queued)
				return;

			queued = true;
			requestAnimationFrame(() => {
				queued = false;
				this.wrapTables();
			});
		}).observe(document.body, { childList: true, subtree: true });
	},

	render(tree) {
		let node = tree;
		let url = '';

		this.renderModeMenu(tree);

		if (L.env.dispatchpath.length >= 3) {
			for (var i = 0; i < 3 && node; i++) {
				node = node.children[L.env.dispatchpath[i]];
				url = url + (url ? '/' : '') + L.env.dispatchpath[i];
			}

			if (node)
				this.renderTabMenu(node, url);
		}
	},

	renderTabMenu(tree, url, level) {
		const container = document.querySelector('#tabmenu');
		const ul = E('ul', { 'class': 'tabs' });
		const children = ui.menu.getChildren(tree);
		let activeNode = null;

		children.forEach(child => {
			const isActive = (L.env.dispatchpath[3 + (level || 0)] == child.name);
			const activeClass = isActive ? ' active' : '';
			const className = 'tabmenu-item-%s %s'.format(child.name, activeClass);

			ul.appendChild(E('li', { 'class': className }, [
				E('a', { 'href': L.url(url, child.name) }, [ _(child.title) ] )]));

			if (isActive)
				activeNode = child;
		});

		if (ul.children.length == 0)
			return E([]);

		container.appendChild(ul);
		container.style.display = '';

		if (activeNode)
			this.renderTabMenu(activeNode, url + '/' + activeNode.name, (level || 0) + 1);

		return ul;
	},

	renderMainMenu(tree, url, level) {
		const ul = level ? E('ul', { 'class': 'dropdown-menu' }) : document.querySelector('#topmenu');
		const children = ui.menu.getChildren(tree);

		if (children.length == 0 || level > 1)
			return E([]);

		children.forEach(child => {
			const submenu = this.renderMainMenu(child, url + '/' + child.name, (level || 0) + 1);
			const subclass = (!level && submenu.firstElementChild) ? 'dropdown' : '';
			const linkclass = (!level && submenu.firstElementChild) ? 'menu' : '';
			const linkurl = submenu.firstElementChild ? '#' : L.url(url, child.name);

			const li = E('li', { 'class': subclass }, [
				E('a', { 'class': linkclass, 'href': linkurl }, [
					_(child.title),
				]),
				submenu
			]);

			ul.appendChild(li);
		});

		ul.style.display = '';

		return ul;
	},

	renderModeMenu(tree) {
		const ul = document.querySelector('#modemenu');
		const children = ui.menu.getChildren(tree);

		children.forEach((child, index) => {
			const isActive = L.env.requestpath.length
				? child.name === L.env.requestpath[0]
				: index === 0;

			ul.appendChild(E('li', { 'class': isActive ? 'active' : '' }, [
				E('a', { 'href': L.url(child.name) }, [ _(child.title) ])
			]));

			if (isActive)
				this.renderMainMenu(child, child.name);
		});

		if (ul.children.length > 1)
			ul.style.display = '';
	}
});
