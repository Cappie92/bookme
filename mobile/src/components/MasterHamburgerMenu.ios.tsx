interface MasterHamburgerMenuProps {
  visible: boolean;
  onClose: (reason?: string) => void;
}

/** iOS uses four direct bottom destinations and intentionally has no Menu sheet. */
export function MasterHamburgerMenu(_props: MasterHamburgerMenuProps) {
  return null;
}
