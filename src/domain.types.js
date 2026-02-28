(() => {
  "use strict";

  const root = globalThis;
  const App = (root.App = root.App || {});
  App.domain = App.domain || {};

  /**
   * @typedef {{
   *   date: string,
   *   roomId: string,
   *   roomName: string,
   *   settingStock: number,
   *   openStatus: string,
   *   totalStock: number,
   *   reservedStock: number,
   *   availableStock: number,
   *   displayCurrent: number,
   *   displayMaximum: number
   * }} ProviderRow
   */

  /**
   * @typedef {{
   *   raw: string,
   *   current: (number|null),
   *   maximum: (number|null),
   *   corrected?: boolean,
   *   originalRaw?: string
   * }} InventoryValue
   */

  /**
   * @typedef {{
   *   col: number,
   *   dateKey: string,
   *   label: string,
   *   weekdayLabel: string
   * }} DateColumn
   */

  /**
   * @typedef {{
   *   row: number,
   *   roomType: string,
   *   roomTypeKey: string,
   *   roomNo: string,
   *   partitionKey?: string
   * }} RoomRow
   */
})();
