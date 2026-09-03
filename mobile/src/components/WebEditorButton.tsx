import type { WebHandoffDestination } from '@src/services/api/auth';

type Props = {
  destination: WebHandoffDestination;
  title: string;
  testID: string;
};

/** Android keeps its existing native screens unchanged. */
export function WebEditorButton(_props: Props) {
  return null;
}
