import React from 'react';
import { View } from 'react-native';
import { MasterLoyaltyInfo } from './MasterLoyaltyInfo';

/** Android master only; client loyalty continues using its existing component. */
export default function MasterBookingLoyaltyHost({ masterId }: { masterId: number }) {
  return <View style={{ marginBottom: 16 }}><MasterLoyaltyInfo masterId={masterId} /></View>;
}
