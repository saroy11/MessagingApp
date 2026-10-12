import { MaterialIcons } from '@expo/vector-icons';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { useEffect, useLayoutEffect, useState } from 'react';
import {
    FlatList,
    Image,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { firestore } from '../firebase';

const profileColors = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A1FF33', '#57FF33',
  '#33A1FF', '#FFB533', '#33FFB5', '#B533FF', '#FF336B', '#336BFF',
];

const getRandomColor = (id) => {
  if (!id) return '#ccc';
  const idString = String(id);
  const hash = idString.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return profileColors[hash % profileColors.length];
};

const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

const formatConversationTime = (seconds) => {
  if (!seconds) return '';

  const date = new Date(seconds * 1000);
  const today = new Date();
  const isToday = date.toDateString() === today.toDateString();

  return isToday
    ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

export default function ChatDetail({ route, navigation }) {
  const { myPhone } = route.params || {};
  const [conversations, setConversations] = useState([]);
  const [searchText, setSearchText] = useState('');
  console.log('iChat: ChatDetail rendered', { hasPhone: Boolean(myPhone) });

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: 'iChat',
      headerStyle: {
        backgroundColor: '#2563EB',
      },
      headerTintColor: 'white',
      headerTitleStyle: {
        fontWeight: '700',
      },
      headerLeft: () => (
        <TouchableOpacity
          onPress={() => navigation.navigate('Contacts', { myPhone })}
          style={styles.addContactButton}
        >
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
      ),
      headerRight: null,
    });
  }, [navigation, myPhone]);

  useEffect(() => {
    if (!myPhone) return;

    const normalizedMyPhone = normalizePhone(myPhone);

    const usersQuery = query(collection(firestore, 'users'));
    const stateQuery = query(collection(firestore, 'conversationState'));

    const unsubscribeUsers = onSnapshot(usersQuery, (snapshot) => {
      const fetchedUsersMap = {};
      snapshot.forEach((doc) => {
        const data = doc.data();
        const normalizedPhone = normalizePhone(data.phone);
        if (normalizedPhone) {
          fetchedUsersMap[normalizedPhone] = {
            name: data.name || data.phone,
            profilePicUrl: data.profilePic || null,
          };
        }
      });

      const unsubscribeState = onSnapshot(stateQuery, (stateSnapshot) => {
        const readStateMap = {};
        stateSnapshot.forEach((doc) => {
          const data = doc.data();
          const stateMyPhone = normalizePhone(data.myPhone);
          const stateUserId = normalizePhone(data.userId);
          if (stateMyPhone && stateUserId) {
            readStateMap[`${stateMyPhone}_${stateUserId}`] = data.lastReadAt?.seconds || 0;
          }
        });

        const messagesQuery = query(collection(firestore, 'messages'));
        const unsubscribeMessages = onSnapshot(messagesQuery, (msgSnapshot) => {
          const messages = msgSnapshot.docs
            .map((doc) => doc.data())
            .filter(
              (msg) =>
                normalizePhone(msg.from) === normalizedMyPhone ||
                normalizePhone(msg.chatWith) === normalizedMyPhone
            );

          const conversationMap = messages.reduce((accumulator, msg) => {
            const from = normalizePhone(msg.from);
            const chatWith = normalizePhone(msg.chatWith);
            const key = from === normalizedMyPhone ? chatWith : from;

            if (!accumulator[key]) {
              accumulator[key] = {
                userId: key,
                name: fetchedUsersMap[key]?.name || key,
                profilePicUrl: fetchedUsersMap[key]?.profilePicUrl || null,
                lastMessage: '',
                timestamp: 0,
                unreadCount: 0,
              };
            }

            const messageTime = msg.createdAt?.seconds || 0;
            const lastReadAt = readStateMap[`${normalizedMyPhone}_${key}`] || 0;
            const isIncomingUnread = from === key && from !== normalizedMyPhone && messageTime > lastReadAt;

            if (messageTime > accumulator[key].timestamp) {
              accumulator[key].lastMessage = msg.text || (msg.attachmentUrl ? `${msg.attachmentType} attachment` : '');
              accumulator[key].timestamp = messageTime;
            }

            if (isIncomingUnread) {
              accumulator[key].unreadCount += 1;
            }

            return accumulator;
          }, {});

          setConversations(
            Object.values(conversationMap).sort((a, b) => b.timestamp - a.timestamp)
          );
        });

        return unsubscribeMessages;
      });

      return unsubscribeState;
    });

    return () => unsubscribeUsers();
  }, [myPhone]);

  const filteredConversations = conversations.filter((conv) => {
    if (!conv.name || typeof conv.name !== 'string') return false;
    const searchValue = searchText.trim().toLowerCase();
    if (!searchValue) return true;

    return (
      conv.name.toLowerCase().includes(searchValue) ||
      String(conv.userId).toLowerCase().includes(searchValue)
    );
  });

  const renderConversation = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ChatPage', { userId: item.userId, name: item.name, myPhone, profilePicUrl: item.profilePicUrl })}
      style={[
        styles.conversationContainer,
        item.unreadCount > 0 && styles.unreadConversation,
      ]}
      activeOpacity={0.92}
    >
      {item.profilePicUrl ? (
        <Image source={{ uri: item.profilePicUrl }} style={styles.profileImage} />
      ) : (
        <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(item.userId) }]}>
          <Text style={styles.profilePicText}>
            {item.name && typeof item.name === 'string' ? item.name.charAt(0).toUpperCase() : ''}
          </Text>
        </View>
      )}
      <View style={styles.conversationContent}>
        <View style={styles.conversationTopRow}>
          <Text style={styles.conversationName} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.conversationTime}>{formatConversationTime(item.timestamp)}</Text>
        </View>
        <View style={styles.conversationBottomRow}>
          <Text style={[styles.conversationMessage, item.unreadCount > 0 && styles.unreadMessageText]} numberOfLines={1}>
            {item.lastMessage || 'Start a conversation'}
          </Text>
          {item.unreadCount > 0 ? (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{item.unreadCount > 9 ? '9+' : item.unreadCount}</Text>
            </View>
          ) : (
            <MaterialIcons name="chevron-right" size={20} color="#B0B7C3" />
          )}
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <View style={styles.emptyIconCircle}>
        <MaterialIcons name="forum" size={34} color="#2563EB" />
      </View>
      <Text style={styles.emptyTitle}>No conversations yet</Text>
      <Text style={styles.emptyText}>Choose a registered contact to start your first chat.</Text>
      <TouchableOpacity
        style={styles.emptyButton}
        onPress={() => navigation.navigate('Contacts', { myPhone })}
      >
        <MaterialIcons name="add" size={19} color="#FFFFFF" />
        <Text style={styles.emptyButtonText}>Start a chat</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={24} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations or numbers"
          value={searchText}
          onChangeText={setSearchText}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {searchText ? (
          <TouchableOpacity onPress={() => setSearchText('')} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <MaterialIcons name="close" size={18} color="#6B7280" />
          </TouchableOpacity>
        ) : null}
      </View>
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => String(item.userId)}
        renderItem={renderConversation}
        contentContainerStyle={filteredConversations.length ? styles.listContent : styles.emptyListContent}
        ListHeaderComponent={filteredConversations.length ? <Text style={styles.sectionLabel}>MESSAGES</Text> : null}
        ListEmptyComponent={renderEmptyState}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F7FF',
  },
  addContactButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 20,
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 15,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E5EBF8',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.04,
    shadowRadius: 10,
    elevation: 2,
  },
  searchIcon: { marginRight: 10 },
  searchInput: { flex: 1, height: 46, fontSize: 16, color: '#1F2937' },
  sectionLabel: {
    color: '#7D8796',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginHorizontal: 22,
    marginTop: 12,
    marginBottom: 8,
  },
  listContent: { paddingBottom: 24 },
  emptyListContent: { flexGrow: 1 },
  conversationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#EDF1F8',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  profilePicPlaceholder: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profilePicText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '700',
  },
  profileImage: {
    width: 52,
    height: 52,
    borderRadius: 26,
    marginRight: 12,
    backgroundColor: '#E9EEF9',
  },
  conversationContent: { flex: 1, minWidth: 0 },
  conversationTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  conversationBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  conversationName: {
    flex: 1,
    fontWeight: '700',
    fontSize: 16,
    color: '#1F2937',
  },
  conversationTime: { fontSize: 12, color: '#8A94A3' },
  conversationMessage: { flex: 1, color: '#667085', fontSize: 14 },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    paddingHorizontal: 44,
    paddingBottom: 64,
  },
  emptyIconCircle: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E8F0FF',
    marginBottom: 18,
  },
  emptyTitle: {
    color: '#1F2937',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyText: { color: '#667085', textAlign: 'center', fontSize: 15, lineHeight: 22 },
  emptyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: '#2563EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 22,
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 3,
  },
  emptyButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 15 },
  unreadConversation: {
    borderColor: '#DCE9FF',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
  },
  unreadBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#2563EB',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    marginLeft: 8,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  unreadMessageText: {
    color: '#111827',
    fontWeight: '700',
  },
});
