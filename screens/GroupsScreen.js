import { MaterialIcons } from '@expo/vector-icons';
import { addDoc, collection, onSnapshot, serverTimestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { firestore } from '../firebase';

const normalizePhone = (value) => {
  const digits = String(value || '').replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
};

export default function GroupsScreen({ route, navigation }) {
  const { myPhone } = route.params || {};
  const [groups, setGroups] = useState([]);
  const [visible, setVisible] = useState(false);
  const [name, setName] = useState('');
  const [members, setMembers] = useState('');

  useEffect(() => {
    const mine = normalizePhone(myPhone);
    return onSnapshot(collection(firestore, 'groups'), (snapshot) => {
      setGroups(snapshot.docs.map((groupDoc) => ({ id: groupDoc.id, ...groupDoc.data() }))
        .filter((group) => group.memberPhones?.includes(mine)));
    }, () => setGroups([]));
  }, [myPhone]);

  const createGroup = async () => {
    const groupName = name.trim();
    const parsedMembers = members.split(',').map(normalizePhone).filter(Boolean);
    const allMembers = [...new Set([normalizePhone(myPhone), ...parsedMembers])];
    if (!groupName || allMembers.length < 2) {
      Alert.alert('Add group details', 'Enter a group name and at least one member phone number.');
      return;
    }
    try {
      const group = await addDoc(collection(firestore, 'groups'), {
        name: groupName,
        memberPhones: allMembers,
        createdAt: serverTimestamp(),
      });
      setVisible(false);
      setName('');
      setMembers('');
      navigation.navigate('ChatPage', { groupId: group.id, groupName, myPhone });
    } catch (error) {
      Alert.alert('Could not create group', error.message || 'Please try again.');
    }
  };

  return <View style={styles.container}>
    <FlatList
      data={groups}
      keyExtractor={(item) => item.id}
      contentContainerStyle={groups.length ? styles.list : styles.empty}
      renderItem={({ item }) => <TouchableOpacity style={styles.row} onPress={() => navigation.navigate('ChatPage', { groupId: item.id, groupName: item.name, myPhone })}>
        <View style={styles.avatar}><MaterialIcons name="group" size={25} color="#FFFFFF" /></View>
        <View><Text style={styles.name}>{item.name}</Text><Text style={styles.detail}>{item.memberPhones?.length || 0} members</Text></View>
      </TouchableOpacity>}
      ListEmptyComponent={<View style={styles.emptyState}><MaterialIcons name="groups" size={44} color="#2563EB" /><Text style={styles.emptyTitle}>No groups yet</Text><Text style={styles.emptyText}>Create a group to chat with multiple people.</Text></View>}
    />
    <TouchableOpacity style={styles.fab} onPress={() => setVisible(true)}><MaterialIcons name="group-add" size={25} color="#FFFFFF" /></TouchableOpacity>
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}><View style={styles.backdrop}><View style={styles.sheet}>
      <Text style={styles.sheetTitle}>New group</Text>
      <TextInput value={name} onChangeText={setName} placeholder="Group name" style={styles.input} />
      <TextInput value={members} onChangeText={setMembers} placeholder="Member numbers, separated by commas" keyboardType="phone-pad" style={styles.input} />
      <TouchableOpacity style={styles.create} onPress={createGroup}><Text style={styles.createText}>Create group</Text></TouchableOpacity>
    </View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F8FC' }, list: { padding: 16 }, empty: { flexGrow: 1 }, row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 14, borderRadius: 16, marginBottom: 8, gap: 12 }, avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center' }, name: { color: '#1F2937', fontSize: 16, fontWeight: '700' }, detail: { color: '#667085', fontSize: 13, marginTop: 3 }, emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 }, emptyTitle: { color: '#1F2937', fontWeight: '800', fontSize: 19, marginTop: 14 }, emptyText: { color: '#667085', textAlign: 'center', marginTop: 7 }, fab: { position: 'absolute', right: 22, bottom: 24, width: 58, height: 58, borderRadius: 29, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', elevation: 5 }, backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.35)' }, sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 22, paddingBottom: 36 }, sheetTitle: { fontSize: 20, fontWeight: '800', color: '#1F2937', marginBottom: 16 }, input: { borderWidth: 1, borderColor: '#E1E8F4', borderRadius: 14, padding: 13, marginBottom: 12, fontSize: 15 }, create: { backgroundColor: '#2563EB', borderRadius: 14, padding: 15, alignItems: 'center' }, createText: { color: '#FFFFFF', fontWeight: '800', fontSize: 16 },
});
