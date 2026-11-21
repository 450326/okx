export const ERROR_CODES = {
  // 4xxx 通用
  BAD_REQUEST: 4000,
  CONFIRM_REQUIRED: 4001,
  UNAUTHORIZED: 4010,
  FORBIDDEN: 4030,
  RATE_LIMITED: 4290,

  // 41xx 交易
  INSUFFICIENT_BALANCE: 4101,
  LEVERAGE_LIMIT: 4102,
  INVALID_QTY: 4103,
  ORDER_NOT_FOUND: 4104,
  POSITION_NOT_FOUND: 4105,
  RISK_REJECTED: 4106,
  INSTRUMENT_NOT_TRADABLE: 4107,
  MIN_NOTIONAL: 4108,
  INVALID_PRICE: 4109,
  CLIENT_ORDER_ID_CONFLICT: 4111,
  LIVE_ORDER_REJECTED: 4112,
  LIVE_ORDER_UNKNOWN: 4113,
  LIVE_ORDER_NOT_FOUND: 4114,
  LIVE_ORDER_INVALID: 4115,
  EXCHANGE_UNAVAILABLE: 4116,

  // 42xx 风控 / 权限
  CAPABILITY_DISABLED: 4201,
  LIVE_ACCOUNT_REQUIRED: 4202,
  LIVE_DATA_UNAVAILABLE: 4203,
  OVERLAY_FORBIDDEN: 4204,

  // 43xx 模式与权限
  MODE_NOT_SUPPORTED: 4301,
  LIVE_NOT_READY: 4302,
  INVALID_MODE_TRANSITION: 4303,
  MODE_API_REQUIRED: 4304,

  // 5xxx 服务端内部
  INTERNAL_ERROR: 5000,

  // 5xxx 上游
  MARKET_UNAVAILABLE: 5001,
  UPSTREAM_ERROR: 5002,
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

interface ErrorMeta {
  reason: string;
  suggestedAction: string;
}

export const ERROR_CATALOG: Record<number, ErrorMeta> = {
  [ERROR_CODES.BAD_REQUEST]: {
    reason: 'bad_request',
    suggestedAction: '检查请求参数后重试',
  },
  [ERROR_CODES.CONFIRM_REQUIRED]: {
    reason: 'confirmation_required',
    suggestedAction: '请先确认该操作',
  },
  [ERROR_CODES.UNAUTHORIZED]: {
    reason: 'unauthorized',
    suggestedAction: '请重新登录',
  },
  [ERROR_CODES.FORBIDDEN]: {
    reason: 'forbidden',
    suggestedAction: '检查账号权限或资源归属',
  },
  [ERROR_CODES.RATE_LIMITED]: {
    reason: 'rate_limited',
    suggestedAction: '稍后再试',
  },
  [ERROR_CODES.INSUFFICIENT_BALANCE]: {
    reason: 'insufficient_balance',
    suggestedAction: '降低下单数量或补充可用余额',
  },
  [ERROR_CODES.LEVERAGE_LIMIT]: {
    reason: 'leverage_limit',
    suggestedAction: '降低杠杆后重试',
  },
  [ERROR_CODES.INVALID_QTY]: {
    reason: 'invalid_quantity',
    suggestedAction: '按最小下单量和数量精度调整',
  },
  [ERROR_CODES.ORDER_NOT_FOUND]: {
    reason: 'order_not_found',
    suggestedAction: '刷新委托列表后重试',
  },
  [ERROR_CODES.POSITION_NOT_FOUND]: {
    reason: 'position_not_found',
    suggestedAction: '刷新持仓后重试',
  },
  [ERROR_CODES.RISK_REJECTED]: {
    reason: 'risk_rejected',
    suggestedAction: '检查持仓方向和风险后重试',
  },
  [ERROR_CODES.INSTRUMENT_NOT_TRADABLE]: {
    reason: 'instrument_not_tradable',
    suggestedAction: '更换可交易品种',
  },
  [ERROR_CODES.MIN_NOTIONAL]: {
    reason: 'min_notional',
    suggestedAction: '提高订单名义价值',
  },
  [ERROR_CODES.INVALID_PRICE]: {
    reason: 'invalid_price',
    suggestedAction: '按价格精度和有效价格范围调整',
  },
  [ERROR_CODES.CLIENT_ORDER_ID_CONFLICT]: {
    reason: 'client_order_id_conflict',
    suggestedAction: '刷新订单状态后使用新的 clientOrderId',
  },
  [ERROR_CODES.LIVE_ORDER_REJECTED]: {
    reason: 'live_order_rejected',
    suggestedAction: '检查 OKX 返回和下单参数',
  },
  [ERROR_CODES.LIVE_ORDER_UNKNOWN]: {
    reason: 'live_order_unknown',
    suggestedAction: '先查询订单状态，不要直接重复下单',
  },
  [ERROR_CODES.LIVE_ORDER_NOT_FOUND]: {
    reason: 'live_order_not_found',
    suggestedAction: '刷新实盘订单后重试',
  },
  [ERROR_CODES.LIVE_ORDER_INVALID]: {
    reason: 'live_order_invalid',
    suggestedAction: '检查下单参数',
  },
  [ERROR_CODES.EXCHANGE_UNAVAILABLE]: {
    reason: 'exchange_unavailable',
    suggestedAction: '稍后重试或检查网络/API 配置',
  },
  [ERROR_CODES.CAPABILITY_DISABLED]: {
    reason: 'capability_disabled',
    suggestedAction: '切换模式或开启对应权限',
  },
  [ERROR_CODES.LIVE_ACCOUNT_REQUIRED]: {
    reason: 'live_account_required',
    suggestedAction: '先绑定并测试 OKX API 账户',
  },
  [ERROR_CODES.LIVE_DATA_UNAVAILABLE]: {
    reason: 'live_data_unavailable',
    suggestedAction: '检查 API 权限和网络后重试',
  },
  [ERROR_CODES.OVERLAY_FORBIDDEN]: {
    reason: 'overlay_forbidden',
    suggestedAction: '使用超级权限账号或关闭叠加查看',
  },
  [ERROR_CODES.MODE_NOT_SUPPORTED]: {
    reason: 'mode_not_supported',
    suggestedAction: '切换到支持的模式',
  },
  [ERROR_CODES.LIVE_NOT_READY]: {
    reason: 'live_not_ready',
    suggestedAction: '完成 API 绑定、权限和余额前置校验',
  },
  [ERROR_CODES.INVALID_MODE_TRANSITION]: {
    reason: 'invalid_mode_transition',
    suggestedAction: '按 simulation → live_readonly → live_trading 顺序切换',
  },
  [ERROR_CODES.MODE_API_REQUIRED]: {
    reason: 'mode_api_required',
    suggestedAction: '先绑定并激活 OKX API 账户',
  },
  [ERROR_CODES.MARKET_UNAVAILABLE]: {
    reason: 'market_unavailable',
    suggestedAction: '稍后重试或检查行情网络',
  },
  [ERROR_CODES.UPSTREAM_ERROR]: {
    reason: 'upstream_error',
    suggestedAction: '检查上游 API 配置和网络后重试',
  },
  [ERROR_CODES.INTERNAL_ERROR]: {
    reason: 'internal_error',
    suggestedAction: '稍后重试或联系管理员',
  },
};

export function describeError(code: number): ErrorMeta {
  return (
    ERROR_CATALOG[code] || {
      reason: 'unknown_error',
      suggestedAction: '请稍后重试或联系支持',
    }
  );
}
