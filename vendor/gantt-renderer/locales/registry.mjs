//#region src/lib/locales/registry.ts
const _registry = /* @__PURE__ */ new Map();
function registerLocale(locale) {
	_registry.set(locale.code, locale);
}
function getRegisteredLocale(code) {
	return _registry.get(code);
}
function getRegisteredLocales() {
	return [..._registry.values()];
}
//#endregion
export { getRegisteredLocale, getRegisteredLocales, registerLocale };

//# sourceMappingURL=registry.mjs.map