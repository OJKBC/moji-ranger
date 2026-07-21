/** @svg-maps/world（CC-BY-4.0）は型定義が無いので最小限を宣言する。 */
declare module '@svg-maps/world' {
  interface SvgMapLocation {
    id: string
    name: string
    path: string
  }
  interface SvgMap {
    id: string
    name: string
    viewBox: string
    locations: SvgMapLocation[]
  }
  const world: SvgMap
  export default world
}
