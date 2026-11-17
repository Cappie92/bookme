/** Shared class bundles for master cabinet (Figma v1.0 WEB). */

const btnBase =
  'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg px-3 py-2 text-base font-semibold leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dedato-action-primary,#4caf50)] disabled:pointer-events-none'

export const mcBtnPrimary =
  `${btnBase} border border-[var(--dedato-action-primary,#4caf50)] bg-[var(--dedato-action-primary,#4caf50)] text-[var(--dedato-text-on-primary,#2d2d2d)] hover:bg-[var(--dedato-action-primary-hover,#45a049)] active:bg-[var(--dedato-action-primary-pressed,#3d9140)] disabled:border-[var(--dedato-surface-disabled,#e7e2df)] disabled:bg-[var(--dedato-surface-disabled,#e7e2df)] disabled:text-[var(--dedato-text-secondary,#5f6368)]`

export const mcBtnSecondary =
  `${btnBase} border border-[var(--dedato-action-primary,#4caf50)] bg-[var(--dedato-surface-elevated,#fff)] text-[var(--dedato-action-primary,#4caf50)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] active:bg-[var(--dedato-surface-tint,#edf6ed)] disabled:border-[var(--dedato-surface-disabled,#e7e2df)] disabled:bg-[var(--dedato-surface-disabled,#e7e2df)] disabled:text-[var(--dedato-text-secondary,#5f6368)]`

export const mcBtnDanger =
  `${btnBase} border border-[var(--dedato-action-danger,#dc2626)] bg-[var(--dedato-surface-elevated,#fff)] text-[var(--dedato-action-danger,#dc2626)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] active:bg-[#fef2f2] disabled:border-[var(--dedato-surface-disabled,#e7e2df)] disabled:bg-[var(--dedato-surface-disabled,#e7e2df)] disabled:text-[var(--dedato-text-secondary,#5f6368)]`

export const mcBtnSecondarySm =
  'inline-flex min-h-[32px] items-center justify-center rounded-lg border border-[var(--dedato-border-default,#6f7972)] bg-[var(--dedato-surface-elevated,#fff)] px-2.5 py-1 text-sm font-semibold leading-5 text-[var(--dedato-action-primary,#4caf50)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] lg:min-h-[44px] lg:px-3 lg:text-base'

export const mcBtnPrimarySm =
  'inline-flex min-h-[32px] items-center justify-center rounded-lg border border-[var(--dedato-action-primary,#4caf50)] bg-[var(--dedato-action-primary,#4caf50)] px-2.5 py-1 text-sm font-semibold leading-5 text-[var(--dedato-text-on-primary,#2d2d2d)] hover:bg-[var(--dedato-action-primary-hover,#45a049)] lg:min-h-[44px] lg:px-3 lg:text-base'

export const mcSegmentTrack =
  'inline-flex gap-1 rounded-[var(--dedato-radius-control,8px)] bg-[var(--dedato-surface-subtle,#f3f4f6)] p-1'

/** Legacy green segment pills — prefer mcCal* for schedule header (Figma 16.11). */
export const mcSegmentActive =
  'inline-flex min-h-[44px] min-w-[4.5rem] items-center justify-center rounded-lg border border-[var(--dedato-action-primary,#4caf50)] bg-[var(--dedato-action-primary,#4caf50)] px-3 text-base font-semibold leading-5 text-[var(--dedato-text-on-primary,#2d2d2d)]'

export const mcSegmentInactive =
  'inline-flex min-h-[44px] min-w-[4.5rem] items-center justify-center rounded-lg border border-[var(--dedato-border-default,#6f7972)] bg-[var(--dedato-surface-elevated,#fff)] px-3 text-base font-semibold leading-5 text-[var(--dedato-action-primary,#4caf50)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)]'

/** Mobile schedule header column (350px at 390 viewport with 20px fields). */
export const mcCalMobilePanel =
  'w-full max-w-[350px] min-w-0'

/** Figma DISCUSSION 16.11 — segmented mode control on #f3f4f6 track. */
export const mcCalSegmentTrack =
  'flex h-12 w-full max-w-[350px] min-w-0 gap-0 rounded-[10px] bg-[var(--dedato-surface-subtle,#f3f4f6)] p-1 lg:max-w-[358px]'

export const mcCalSegmentBtn =
  'flex h-10 min-h-10 min-w-0 flex-1 items-center justify-center rounded-[10px] text-base font-semibold leading-5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dedato-action-primary,#4caf50)] disabled:pointer-events-none disabled:opacity-50'

export const mcCalSegmentActive =
  `${mcCalSegmentBtn} bg-[var(--dedato-surface-elevated,#fff)] text-[var(--dedato-text-primary,#2d2d2d)]`

export const mcCalSegmentInactive =
  `${mcCalSegmentBtn} bg-transparent text-[var(--dedato-text-secondary,#5f6368)] hover:text-[var(--dedato-text-primary,#2d2d2d)]`

export const mcCalOutlineAction =
  'inline-flex h-11 min-h-[44px] min-w-0 max-w-[171px] flex-1 basis-0 items-center justify-center gap-2 rounded-[10px] border border-[var(--dedato-brand-primary,#4caf50)] bg-[var(--dedato-surface-elevated,#fff)] px-2 text-base font-semibold leading-5 text-[var(--dedato-brand-primary,#4caf50)] transition-colors hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dedato-action-primary,#4caf50)] lg:w-[168px] lg:max-w-none lg:flex-none lg:basis-auto lg:px-3'

export const mcCalNavIconBtn =
  'inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--dedato-surface-elevated,#fff)] text-[var(--dedato-text-primary,#2d2d2d)] transition-colors hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--dedato-action-primary,#4caf50)]'

export const mcCalTodayBtn =
  'inline-flex h-11 min-h-[44px] shrink-0 items-center justify-center rounded-[10px] border border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)] px-2 text-base font-semibold leading-5 text-[var(--dedato-text-primary,#2d2d2d)] hover:bg-[var(--dedato-surface-subtle,#f3f4f6)] max-lg:min-w-[72px] max-lg:w-[72px] lg:w-[88px]'

export const mcCalPeriodLabel =
  'min-w-0 flex-1 text-center text-base font-normal leading-6 text-[var(--dedato-text-primary,#2d2d2d)] max-lg:max-w-[166px] lg:w-[264px] lg:flex-none lg:shrink-0'

/** Dashboard hub tabs (white active pill on subtle track). */
export const mcHubTabActive =
  'min-h-[40px] min-w-0 flex-1 rounded-[10px] bg-[var(--dedato-surface-elevated,#fff)] px-3 py-2 text-base font-semibold leading-5 text-[var(--dedato-text-primary,#2d2d2d)] shadow-[0_1px_2px_rgba(45,45,45,0.10)]'

export const mcHubTabInactive =
  'min-h-[40px] min-w-0 flex-1 rounded-[10px] px-3 py-2 text-base font-semibold leading-5 text-[var(--dedato-text-secondary,#5f6368)] transition hover:bg-white/30 hover:text-[var(--dedato-text-primary,#2d2d2d)]'

export const mcPageTitle =
  'font-display text-[26px] font-bold leading-9 tracking-tight text-[var(--dedato-text-primary,#2d2d2d)] lg:text-[30px] lg:leading-[36px]'

export const mcFormTitle =
  'text-2xl font-semibold leading-8 text-[var(--dedato-text-primary,#2d2d2d)]'

export const mcDateHeading =
  'text-xl font-semibold leading-7 text-[var(--dedato-text-primary,#2d2d2d)]'

export const mcCard =
  'rounded-[var(--dedato-radius-card,16px)] border border-[var(--dedato-border-decorative,#e7e2df)] bg-[var(--dedato-surface-elevated,#fff)]'

export const mcInput =
  'mt-1 w-full rounded-lg border border-[var(--dedato-border-default,#6f7972)] px-3 py-2 text-base font-normal leading-6 text-[var(--dedato-text-primary,#2d2d2d)] focus:border-[var(--dedato-action-primary,#4caf50)] focus:outline-none focus:ring-2 focus:ring-[var(--dedato-action-primary,#4caf50)]/20'

/** Figma day split 566 + 24 + 530 inside 1120 content column; fr units shrink below 1120 viewport */
export const mcDaySplitGrid =
  'lg:mx-auto lg:grid lg:w-full lg:min-w-0 lg:max-w-[1120px] lg:grid-cols-[minmax(0,566fr)_minmax(0,530fr)] lg:items-stretch lg:gap-6'

export const mcDayAsideShell =
  'hidden min-h-0 min-w-0 flex-col lg:flex lg:max-h-[600px] lg:overflow-x-hidden lg:overflow-y-auto'

export const mcWeekCanvas =
  'mx-auto w-full max-w-[1120px]'
