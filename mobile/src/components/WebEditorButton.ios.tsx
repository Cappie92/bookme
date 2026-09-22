import type { WebHandoffDestination } from '@src/services/api/auth';

type Props = {
  destination: WebHandoffDestination;
  title: string;
  testID: string;
  parentHasPagePadding?: boolean;
};

/** iOS companion has no browser-editor CTA. Android/web handoff helpers stay dormant. */
export function WebEditorButton(_props: Props) {
  return null;
}
