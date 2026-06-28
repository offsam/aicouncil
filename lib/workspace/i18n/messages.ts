export type WorkspaceLocale = "ru" | "en";

export type WorkspaceMessages = {
  localeName: string;
  addBuilding: string;
  buildingNamePlaceholder: string;
  buildingDescriptionPlaceholder: string;
  create: string;
  cancel: string;
  connect: string;
  connectActive: string;
  canvasBg: string;
  undo: string;
  undoTitle: string;
  selectedCount: (n: number) => string;
  connectHintPickSource: string;
  connectHintPickTarget: (source: string) => string;
  connectHintFromMenu: (source: string) => string;
  connectHintDragHandles: string;
  newConnection: string;
  connectionPermissions: string;
  permReadKnowledge: string;
  permReadRules: string;
  permReadResults: string;
  permSendTasks: string;
  createConnection: string;
  addToBuilding: string;
  addToChamber: string;
  addToAgent: string;
  deleteBuilding: string;
  deleteChamber: string;
  chamberLabel: string;
  cityHallSubtitle: string;
  menuChamber: string;
  menuColor: string;
  menuRule: string;
  menuKnowledge: string;
  menuRouting: string;
  menuInspector: string;
  menuAgent: string;
  menuConnect: string;
  menuConnectDesc: string;
  nodeMenuButtonLabel: string;
  menuActionsBuilding: (label: string) => string;
  menuActionsChamber: (label: string) => string;
  menuActionsAgent: (label: string) => string;
  menuDelete: string;
  menuDeleteDescBuilding: string;
  menuDeleteDescChamber: string;
  menuDeleteDescAgent: string;
  workspaceTitle: string;
  admin: string;
  loading: string;
  dismiss: string;
  paneAddBuilding: string;
  buildingNamePrompt: string;
  handleMove: string;
  handleMoveDesc: string;
  handleConnect: string;
  handleConnectDesc: string;
  handleMoveHint: string;
  nodeDragTitle: string;
  nodeDragAria: (label: string) => string;
  connectionPopoverKind: string;
  connectionSource: string;
  connectionTarget: string;
  connectionStatus: string;
  connectionActive: string;
  connectionInactive: string;
  connectionPriority: string;
  connectionCreated: string;
  connectionActiveFor: string;
  connectionStatRequests: string;
  connectionStatTokens: string;
  connectionStatSuccess: string;
  connectionStatErrors: string;
  connectionDelete: string;
  connectionDeleteConfirm: string;
  techDeptMenuTitle: string;
  techDeptMenuMonitoring: string;
  techDeptMenuMonitoringDesc: string;
  techDeptMenuCounters: string;
  techDeptMenuCountersDesc: (visible: number, total: number) => string;
  techDeptMenuConnectDesc: string;
  techDeptCounterPickerHint: string;
  techDeptCounterPickerSave: string;
};

const ru: WorkspaceMessages = {
  localeName: "Русский",
  addBuilding: "+ Здание",
  buildingNamePlaceholder: "Название здания",
  buildingDescriptionPlaceholder: "Кратко опишите, чем занимается здание",
  create: "Создать",
  cancel: "Отмена",
  connect: "Соединить",
  connectActive: "Соединение ✓",
  canvasBg: "Фон",
  undo: "Отменить",
  undoTitle: "Отменить последнее действие (⌘Z)",
  selectedCount: (n) => `${n} выбрано`,
  connectHintPickSource: "Выберите здание, отдел или агента — источник",
  connectHintPickTarget: (source) => `Выберите цель для «${source}»`,
  connectHintFromMenu: (source) =>
    `Кабель прикреплён к «${source}». Кликните по зданию, отделу или агенту — назначение.`,
  connectHintDragHandles:
    "Тяните от порта — кабель. Shift + тяните — сдвинуть порт по контуру. N — новый порт на выбранном объекте.",
  newConnection: "Новое соединение",
  connectionPermissions: "Права на связь",
  permReadKnowledge: "Читать знания",
  permReadRules: "Читать правила",
  permReadResults: "Читать результаты",
  permSendTasks: "Отправлять задачи",
  createConnection: "Создать связь",
  addToBuilding: "Добавить в здание",
  addToChamber: "Добавить в отдел",
  addToAgent: "Действия с агентом",
  deleteBuilding: "Удалить",
  deleteChamber: "Удалить",
  chamberLabel: "Отдел",
  cityHallSubtitle: "Мэр · Совет",
  menuChamber: "Отдел",
  menuColor: "Цвет",
  menuRule: "Правило",
  menuKnowledge: "Знания",
  menuRouting: "Маршрутизация",
  menuInspector: "Инспектор",
  menuAgent: "Агент",
  menuConnect: "Соединить",
  menuConnectDesc: "Провести кабель к другому объекту",
  nodeMenuButtonLabel: "Действия",
  menuActionsBuilding: (label) => `Действия — здание «${label}»`,
  menuActionsChamber: (label) => `Действия — отдел «${label}»`,
  menuActionsAgent: (label) => `Действия — агент «${label}»`,
  menuDelete: "Удалить",
  menuDeleteDescBuilding: "Удалить здание с холста",
  menuDeleteDescChamber: "Удалить отдел",
  menuDeleteDescAgent: "Снять агента с отдела",
  workspaceTitle: "Рабочее пространство",
  admin: "Админ",
  loading: "Загрузка…",
  dismiss: "Закрыть",
  paneAddBuilding: "Добавить здание здесь",
  buildingNamePrompt: "Название здания",
  handleMove: "Подвинуть",
  handleMoveDesc: "Перетащить порт по периметру",
  handleConnect: "Соединить",
  handleConnectDesc: "Провести кабель к другому объекту",
  handleMoveHint: "Shift + перетащите по контуру · отпустите для фиксации · Esc — отмена",
  nodeDragTitle: "Переместить",
  nodeDragAria: (label) => `Переместить «${label}»`,
  connectionPopoverKind: "Соединение",
  connectionSource: "источник",
  connectionTarget: "цель",
  connectionStatus: "статус",
  connectionActive: "активно",
  connectionInactive: "неактивно",
  connectionPriority: "приоритет",
  connectionCreated: "создано",
  connectionActiveFor: "активно",
  connectionStatRequests: "запросы",
  connectionStatTokens: "токены ≈",
  connectionStatSuccess: "успех",
  connectionStatErrors: "ошибки",
  connectionDelete: "Удалить соединение",
  connectionDeleteConfirm: "Удалить это соединение?",
  techDeptMenuTitle: "Техотдел",
  techDeptMenuMonitoring: "Панель мониторинга",
  techDeptMenuMonitoringDesc: "Провайдеры, агенты, fallback, история",
  techDeptMenuCounters: "Счётчики на плитке",
  techDeptMenuCountersDesc: (visible, total) => `${visible} из ${total} — выбрать что показывать`,
  techDeptMenuConnectDesc: "Кабель к другому объекту (не обязательно)",
  techDeptCounterPickerHint: "Счётчики на плитке обновляются при действиях на canvas (отдел, агент, кабель). LLM-метрики — в Inspector.",
  techDeptCounterPickerSave: "Применить",
};

const en: WorkspaceMessages = {
  localeName: "English",
  addBuilding: "+ Building",
  buildingNamePlaceholder: "Building name",
  buildingDescriptionPlaceholder: "Briefly describe what this building does",
  create: "Create",
  cancel: "Cancel",
  connect: "Connect",
  connectActive: "Connect ✓",
  canvasBg: "Canvas",
  undo: "Undo",
  undoTitle: "Undo last action (⌘Z)",
  selectedCount: (n) => `${n} selected`,
  connectHintPickSource: "Pick source building, chamber, or agent",
  connectHintPickTarget: (source) => `Pick target for «${source}»`,
  connectHintFromMenu: (source) =>
    `Cable attached to «${source}». Click a building, chamber, or agent as target.`,
  connectHintDragHandles:
    "Drag from a port to draw a cable. Shift + drag moves the port along the outline. N — add a port on the selected object.",
  newConnection: "New connection",
  connectionPermissions: "Connection permissions",
  permReadKnowledge: "Read knowledge",
  permReadRules: "Read rules",
  permReadResults: "Read results",
  permSendTasks: "Send tasks",
  createConnection: "Create connection",
  addToBuilding: "Add to building",
  addToChamber: "Add to chamber",
  addToAgent: "Agent actions",
  deleteBuilding: "Delete",
  deleteChamber: "Delete",
  chamberLabel: "Chamber",
  cityHallSubtitle: "Mayor · Council Hub",
  menuChamber: "Chamber",
  menuColor: "Color",
  menuRule: "Rule",
  menuKnowledge: "Knowledge",
  menuRouting: "Routing",
  menuInspector: "Inspector",
  menuAgent: "Agent",
  menuConnect: "Connect",
  menuConnectDesc: "Run cable to another object",
  nodeMenuButtonLabel: "Actions",
  menuActionsBuilding: (label) => `Actions — building «${label}»`,
  menuActionsChamber: (label) => `Actions — chamber «${label}»`,
  menuActionsAgent: (label) => `Actions — agent «${label}»`,
  menuDelete: "Delete",
  menuDeleteDescBuilding: "Remove building from canvas",
  menuDeleteDescChamber: "Remove chamber",
  menuDeleteDescAgent: "Unassign agent from chamber",
  workspaceTitle: "Workspace",
  admin: "Admin",
  loading: "Loading…",
  dismiss: "Dismiss",
  paneAddBuilding: "Add building here",
  buildingNamePrompt: "Building name",
  handleMove: "Move",
  handleMoveDesc: "Reposition port along perimeter",
  handleConnect: "Connect",
  handleConnectDesc: "Run cable to another object",
  handleMoveHint: "Shift + drag along the perimeter · release to place · Esc cancels",
  nodeDragTitle: "Move",
  nodeDragAria: (label) => `Move «${label}»`,
  connectionPopoverKind: "Connection",
  connectionSource: "source",
  connectionTarget: "target",
  connectionStatus: "status",
  connectionActive: "active",
  connectionInactive: "inactive",
  connectionPriority: "priority",
  connectionCreated: "created",
  connectionActiveFor: "active for",
  connectionStatRequests: "requests",
  connectionStatTokens: "tokens ≈",
  connectionStatSuccess: "success",
  connectionStatErrors: "errors",
  connectionDelete: "Delete connection",
  connectionDeleteConfirm: "Delete this connection?",
  techDeptMenuTitle: "Tech ops",
  techDeptMenuMonitoring: "Monitoring panel",
  techDeptMenuMonitoringDesc: "Providers, agents, fallback, history",
  techDeptMenuCounters: "Tile counters",
  techDeptMenuCountersDesc: (visible, total) => `${visible} of ${total} — pick metrics to show`,
  techDeptMenuConnectDesc: "Cable to another object (optional)",
  techDeptCounterPickerHint: "Tile counters refresh on canvas actions (chamber, agent, cable). LLM metrics — in Inspector.",
  techDeptCounterPickerSave: "Apply",
};

export const WORKSPACE_MESSAGES: Record<WorkspaceLocale, WorkspaceMessages> = { ru, en };

export const WORKSPACE_LOCALE_STORAGE_KEY = "workspace-locale";
