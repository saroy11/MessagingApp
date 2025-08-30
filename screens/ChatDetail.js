import { MaterialIcons } from '@expo/vector-icons';
import { collection, getDocs, onSnapshot, query } from 'firebase/firestore';
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
  return String(phone).replace(/^\+91/, '').replace(/[^0-9]/g, '');
};

export default function ChatDetail({ route, navigation }) {
  const { myPhone } = route.params || {};
  const [conversations, setConversations] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [searchText, setSearchText] = useState('');

  useLayoutEffect(() => {
    navigation.setOptions({
      headerShown: true,
      headerTitle: 'iChat',
      headerStyle: {
        backgroundColor: '#007AFF',
      },
      headerTintColor: 'white',
      headerTitleStyle: {
        fontWeight: 'bold',
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

    const fetchUsers = async () => {
      const usersQuery = query(collection(firestore, 'users'));
      const usersSnapshot = await getDocs(usersQuery);
      const fetchedUsersMap = {};
      usersSnapshot.forEach((doc) => {
        const data = doc.data();
        fetchedUsersMap[normalizePhone(data.phone)] = {
          name: data.name || data.phone,
          // Correctly use the profilePic field
          profilePicUrl: data.profilePic || null,
        };
      });
      setUsersMap(fetchedUsersMap);
    };

    fetchUsers();
  }, [myPhone]);

  useEffect(() => {
    if (!myPhone || Object.keys(usersMap).length === 0) return;

    const normalizedMyPhone = normalizePhone(myPhone);
    const messagesQuery = query(collection(firestore, 'messages'));
    const unsubscribe = onSnapshot(messagesQuery, (snapshot) => {
      const messages = snapshot.docs.map((doc) => doc.data()).filter(
        (msg) => (normalizePhone(msg.from) === normalizedMyPhone || normalizePhone(msg.chatWith) === normalizedMyPhone)
      );

      const conversationMap = messages.reduce((accumulator, msg) => {
        const key = (normalizePhone(msg.from) === normalizedMyPhone) ? normalizePhone(msg.chatWith) : normalizePhone(msg.from);
        
        if (!accumulator[key]) {
          accumulator[key] = {
            userId: key,
            name: usersMap[key]?.name || key,
            profilePicUrl: usersMap[key]?.profilePicUrl || null,
            lastMessage: '',
            timestamp: 0,
          };
        }
        if (msg.createdAt?.seconds > accumulator[key].timestamp) {
          accumulator[key].lastMessage = msg.text || (msg.attachmentUrl ? `${msg.attachmentType} attachment` : '');
          accumulator[key].timestamp = msg.createdAt?.seconds || 0;
        }
        return accumulator;
      }, {});
      setConversations(Object.values(conversationMap).sort((a, b) => b.timestamp - a.timestamp));
    });

    return () => unsubscribe();
  }, [myPhone, usersMap]);

  const filteredConversations = conversations.filter(conv =>
    conv.name && typeof conv.name === 'string' && conv.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const renderConversation = ({ item }) => (
    <TouchableOpacity
      onPress={() => navigation.navigate('ChatPage', { userId: item.userId, name: item.name, myPhone })}
      style={styles.conversationContainer}
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
        <Text style={styles.conversationName}>{item.name}</Text>
        <Text style={styles.conversationMessage}>{item.lastMessage}</Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={24} color="#999" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search..."
          value={searchText}
          onChangeText={setSearchText}
        />
      </View>
      <FlatList
        data={filteredConversations}
        keyExtractor={(item) => String(item.userId)}
        renderItem={renderConversation}
        ListEmptyComponent={<Text style={styles.emptyText}>No conversations yet.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  addContactButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
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
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    margin: 16,
    paddingHorizontal: 8,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 40 },
  conversationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#d9d9d9',
  },
  profilePicPlaceholder: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  profilePicText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  conversationContent: { flex: 1 },
  conversationName: { fontWeight: 'bold', fontSize: 16 },
  conversationMessage: { color: '#555' },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#555' },
});