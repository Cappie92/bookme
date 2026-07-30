/**
 * Контракт UI для удалённого мастера (зеркало логики BookingRowPast / BookingRowFuture).
 */
describe('deleted master booking UI flags', () => {
  function flags(booking: {
    master_is_deleted?: boolean;
    master_domain?: string | null;
  }) {
    const masterDeleted = !!booking.master_is_deleted;
    return {
      canPressMaster:
        !masterDeleted && !!(booking.master_domain && booking.master_domain.trim()),
      canRepeat: !masterDeleted,
    };
  }

  it('disables navigation and repeat for deleted master', () => {
    expect(
      flags({ master_is_deleted: true, master_domain: null })
    ).toEqual({ canPressMaster: false, canRepeat: false });
  });

  it('keeps navigation for active master with domain', () => {
    expect(
      flags({ master_is_deleted: false, master_domain: 'anna' })
    ).toEqual({ canPressMaster: true, canRepeat: true });
  });
});
