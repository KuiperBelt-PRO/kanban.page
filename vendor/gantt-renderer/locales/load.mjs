//#region src/lib/locales/loadLocale.ts
const _importMap = {
	en: async () => {
		return await import("./en.mjs");
	},
	"zh-Hans": async () => {
		return await import("./zh-Hans.mjs");
	},
	"zh-Hant": async () => {
		return await import("./zh-Hant.mjs");
	},
	es: async () => {
		return await import("./es.mjs");
	},
	"pt-BR": async () => {
		return await import("./pt-BR.mjs");
	},
	"pt-PT": async () => {
		return await import("./pt-PT.mjs");
	},
	fr: async () => {
		return await import("./fr.mjs");
	},
	de: async () => {
		return await import("./de.mjs");
	},
	ru: async () => {
		return await import("./ru.mjs");
	},
	ja: async () => {
		return await import("./ja.mjs");
	},
	ko: async () => {
		return await import("./ko.mjs");
	},
	ar: async () => {
		return await import("./ar.mjs");
	},
	hi: async () => {
		return await import("./hi.mjs");
	},
	id: async () => {
		return await import("./id.mjs");
	},
	th: async () => {
		return await import("./th.mjs");
	},
	tr: async () => {
		return await import("./tr.mjs");
	},
	it: async () => {
		return await import("./it.mjs");
	},
	pl: async () => {
		return await import("./pl.mjs");
	},
	nl: async () => {
		return await import("./nl.mjs");
	},
	sv: async () => {
		return await import("./sv.mjs");
	},
	da: async () => {
		return await import("./da.mjs");
	},
	nb: async () => {
		return await import("./nb.mjs");
	},
	fi: async () => {
		return await import("./fi.mjs");
	},
	uk: async () => {
		return await import("./uk.mjs");
	},
	ro: async () => {
		return await import("./ro.mjs");
	},
	cs: async () => {
		return await import("./cs.mjs");
	},
	hu: async () => {
		return await import("./hu.mjs");
	},
	el: async () => {
		return await import("./el.mjs");
	},
	sk: async () => {
		return await import("./sk.mjs");
	},
	bg: async () => {
		return await import("./bg.mjs");
	},
	hr: async () => {
		return await import("./hr.mjs");
	},
	sr: async () => {
		return await import("./sr.mjs");
	},
	lt: async () => {
		return await import("./lt.mjs");
	},
	lv: async () => {
		return await import("./lv.mjs");
	},
	et: async () => {
		return await import("./et.mjs");
	},
	sl: async () => {
		return await import("./sl.mjs");
	},
	be: async () => {
		return await import("./be.mjs");
	},
	sq: async () => {
		return await import("./sq.mjs");
	},
	mk: async () => {
		return await import("./mk.mjs");
	},
	ca: async () => {
		return await import("./ca.mjs");
	},
	eu: async () => {
		return await import("./eu.mjs");
	},
	cy: async () => {
		return await import("./cy.mjs");
	},
	ga: async () => {
		return await import("./ga.mjs");
	},
	mt: async () => {
		return await import("./mt.mjs");
	}
};
const SUPPORTED_LOCALE_CODES = Object.keys(_importMap);
async function loadLocale(code) {
	const loader = _importMap[code];
	if (loader === void 0) throw new Error(`Unsupported locale: ${code}`);
	return (await loader()).CHART_LOCALE;
}
//#endregion
export { SUPPORTED_LOCALE_CODES, loadLocale };

//# sourceMappingURL=load.mjs.map