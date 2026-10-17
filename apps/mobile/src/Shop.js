// The Shop and the unlock sheet, drawn from @blockout/progress/shop (the same
// rules and words as the web game's Shop).
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Shop from '@blockout/progress/shop';
import { useTheme } from './theme';
import { Button } from './ui';

// The whole Shop: groups of rows, All | Available, points at the top.
// onAsk(itemId) opens the unlock sheet for a row.
export function ShopScreen({ progress, onAsk, onClose }) {
  const t = useTheme();
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const only = onlyAvailable ? Shop.availableIds(progress) : null;
  const groups = Shop.shopGroups(progress, only);
  return (
    <View style={[styles.fill, { backgroundColor: t.bg }]}>
      <View style={styles.header}>
        <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Back to the menu" hitSlop={10} style={[styles.close, { borderColor: t.line, backgroundColor: t.surface }]}>
          <Text style={[styles.closeText, { color: t.ink }]}>✕</Text>
        </Pressable>
        <Text style={[styles.title, { color: t.ink }]}>Shop</Text>
        <Text testID="shop-wallet" style={[styles.wallet, { color: t.goldInk, backgroundColor: t.goldBg }]}>
          🪙 {Shop.formatPoints(progress.wallet)}
        </Text>
      </View>
      <View style={styles.toggle}>
        {[
          [false, 'All'],
          [true, 'Available'],
        ].map(([value, label]) => (
          <Pressable
            key={label}
            testID={`shop-${label.toLowerCase()}`}
            accessibilityRole="radio"
            accessibilityState={{ selected: onlyAvailable === value }}
            onPress={() => setOnlyAvailable(value)}
            style={[styles.toggleOption, { backgroundColor: onlyAvailable === value ? t.accentSoft : t.surface, borderColor: onlyAvailable === value ? t.accent : t.line }]}
          >
            <Text style={[styles.toggleText, { color: t.ink }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.list}>
        {onlyAvailable && !groups.length ? <Text style={[styles.empty, { color: t.muted }]}>Nothing to unlock right now. Keep playing to earn points!</Text> : null}
        {groups.map((g) => (
          <View key={g.name} style={styles.group}>
            <Text style={[styles.groupTitle, { color: t.muted }]}>{g.name}</Text>
            {g.rows.map((r) => (
              <ShopRow key={r.item.id} row={r} onAsk={onAsk} />
            ))}
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function ShopRow({ row, onAsk }) {
  const t = useTheme();
  const { item, owned, hidden, canBuy, why } = row;
  return (
    <Pressable
      testID={`shop-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={hidden ? 'Locked' : `${item.name}${owned ? ', unlocked' : `, ${item.price} points`}`}
      disabled={owned}
      onPress={() => onAsk(item.id)}
      style={({ pressed }) => [styles.row, { backgroundColor: t.surface, borderColor: t.line, opacity: hidden ? 0.6 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowName, { color: hidden ? t.muted : t.ink }]}>{hidden ? 'Locked' : item.name}</Text>
        {!hidden && item.perk ? <Text style={[styles.rowPerk, { color: t.goodInk }]}>🎁 {item.perk}</Text> : null}
        {why ? <Text style={[styles.rowWhy, { color: t.muted }]}>{why}</Text> : null}
      </View>
      {owned ? (
        <Text style={[styles.owned, { color: t.goodInk }]}>✓ Unlocked</Text>
      ) : (
        <View style={[styles.price, { backgroundColor: canBuy ? t.accentButton : t.soft, borderColor: canBuy ? t.accentButton : t.line }]}>
          <Text style={[styles.priceText, { color: canBuy ? t.accentInk : t.muted }]}>{hidden ? '🔒' : `🪙 ${Shop.formatPoints(item.price)}`}</Text>
        </View>
      )}
    </Pressable>
  );
}

// "Unlock X?" (or what comes first, or how to reveal it): Shop.unlockOffer's
// answer, with Unlock / Cancel, or just OK
export function UnlockSheet({ offer, onBuy, onClose }) {
  const t = useTheme();
  if (!offer) return null;
  const yes = offer.kind === 'offer';
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={[styles.backdrop]} onPress={onClose} accessibilityLabel="Close">
        <Pressable style={[styles.sheet, { backgroundColor: t.paper, borderColor: t.line }]} onPress={() => {}}>
          <Text testID="unlock-title" style={[styles.sheetTitle, { color: t.ink }]}>
            {offer.title}
          </Text>
          {offer.kind !== 'earn' ? <Text style={[styles.sheetPrice, { color: t.goldInk }]}>{offer.price}</Text> : null}
          {offer.message ? (
            <Text testID="unlock-message" style={[styles.sheetMessage, { color: t.ink }]}>
              {offer.message}
            </Text>
          ) : null}
          <View style={styles.sheetActions}>
            {yes ? <Button testID="unlock-yes" title={`Unlock for 🪙 ${Shop.formatPoints(offer.item.price)}`} onPress={() => onBuy(offer.item.id)} style={styles.flex} /> : null}
            <Button testID="unlock-no" kind={yes ? 'secondary' : 'primary'} title={yes ? 'Cancel' : 'OK'} onPress={onClose} style={yes ? styles.cancel : styles.flex} />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  close: { width: 40, height: 40, borderRadius: 20, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 18, fontWeight: '800' },
  title: { flex: 1, fontSize: 26, fontWeight: '900' },
  wallet: { fontSize: 17, fontWeight: '800', paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, overflow: 'hidden' },
  toggle: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 8 },
  toggleOption: { flex: 1, height: 40, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  toggleText: { fontSize: 15, fontWeight: '700' },
  list: { padding: 16, paddingTop: 4, gap: 18, paddingBottom: 40 },
  empty: { fontSize: 16, textAlign: 'center', marginTop: 24 },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2 },
  rowText: { flex: 1, gap: 3 },
  rowName: { fontSize: 16, fontWeight: '700' },
  rowPerk: { fontSize: 14 },
  rowWhy: { fontSize: 13 },
  owned: { fontSize: 15, fontWeight: '700' },
  price: { minWidth: 72, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, alignItems: 'center' },
  priceText: { fontSize: 15, fontWeight: '800' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: { margin: 12, marginBottom: 24, padding: 20, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth * 2, gap: 10 },
  sheetTitle: { fontSize: 22, fontWeight: '800' },
  sheetPrice: { fontSize: 16, fontWeight: '700' },
  sheetMessage: { fontSize: 16, lineHeight: 22 },
  sheetActions: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancel: { minWidth: 110 },
});
