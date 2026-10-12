import { MaterialIcons } from '@expo/vector-icons';
import * as Contacts from 'expo-contacts';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { firestore } from '../firebase';

// Code for the profile circles
const profileColors = [
  '#FF5733', '#33FF57', '#3357FF', '#FF33A1', '#A1FF33', '#57FF33',
  '#33A1FF', '#FFB533', '#33FFB5', '#B533FF', '#FF336B', '#336BFF',
];

const getRandomColor = (name) => {
  if (!name) return '#ccc';
  const hash = name.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return profileColors[hash % profileColors.length];
};

export default function ContactsScreen({ navigation, route }) {
  const [contacts, setContacts] = useState([]);
  const [searchText, setSearchText] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [contactsPermissionDenied, setContactsPermissionDenied] = useState(false);
  const myPhone = route?.params?.myPhone;

  const normalizePhone = (phone) => {
    let phoneStr = (phone === null || phone === undefined) ? '' : String(phone).trim();
    if (!phoneStr) {
      console.warn('Invalid phone number input:', phone);
      return { normalized: '', raw: '' };
    }
    const digits = phoneStr.replace(/\D/g, '');
    if (!digits) {
      return { normalized: '', raw: '' };
    }
    const normalizedDigits = digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
    const finalDigits = normalizedDigits.length > 10 ? normalizedDigits.slice(-10) : normalizedDigits;
    return { normalized: `+91${finalDigits}`, raw: finalDigits };
  };

  useEffect(() => {
    const fetchPhoneContacts = async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') {
          setContactsPermissionDenied(true);
          Alert.alert('Permission Denied', 'Please allow access to contacts to proceed.');
          return;
        }
        setContactsPermissionDenied(false);
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });

        const normalizedMyPhone = normalizePhone(myPhone).normalized;
        const uniqueContacts = new Map();
        data.forEach((contact) => {
          contact.phoneNumbers?.forEach((phone) => {
            const phoneData = normalizePhone(phone.number);
            if (!phoneData.normalized || phoneData.normalized === normalizedMyPhone || uniqueContacts.has(phoneData.normalized)) {
              return;
            }

            uniqueContacts.set(phoneData.normalized, {
              id: contact.id,
              name: contact.name || 'Unknown',
              phone: phoneData.normalized,
              isAppUser: false,
              firebaseUserId: null,
              profilePic: null,
            });
          });
        });

        // Show device contacts even if the registered-user lookup is unavailable.
        // The lookup below only enriches contacts that are already on iChat.
        const deviceContacts = Array.from(uniqueContacts.values());
        setContacts(deviceContacts.sort((a, b) => a.name.localeCompare(b.name)));

        const phoneToProfilePic = {};
        const registeredPhones = new Set();
        try {
          const querySnapshot = await getDocs(collection(firestore, 'users'));
          querySnapshot.docs.forEach((doc) => {
            const userData = doc.data();
            const storedPhone = userData.phone ?? userData.phoneRaw;
            const phoneData = normalizePhone(
              storedPhone ?? (/^\d{10}$/.test(doc.id) ? doc.id : '')
            );
            if (phoneData.raw) {
              registeredPhones.add(phoneData.raw);
              if (userData.profilePic) {
                phoneToProfilePic[phoneData.raw] = userData.profilePic;
              }
            }
          });
        } catch (error) {
          console.warn('Unable to look up registered contacts:', error);
        }

        const contactsWithRegistration = deviceContacts
          .map((contact) => {
            const phoneData = normalizePhone(contact.phone);
            const isAppUser = registeredPhones.has(phoneData.raw);
            return {
              ...contact,
              isAppUser,
              firebaseUserId: isAppUser ? contact.phone : null,
              profilePic: phoneToProfilePic[phoneData.raw] || null,
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));

        setContacts(contactsWithRegistration);
      } catch (err) {
        console.error('Error fetching contacts:', err);
        Alert.alert('Error', 'Failed to fetch contacts: ' + err.message);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPhoneContacts();
  }, [myPhone]);

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    if (!query) return contacts;

    return contacts.filter((contact) => {
      const nameMatch = contact.name?.toLowerCase().includes(query);
      const phoneMatch = contact.phone?.toLowerCase().includes(query);
      return nameMatch || phoneMatch;
    });
  }, [contacts, searchText]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.isAppUser && item.firebaseUserId) {
          navigation.goBack();
          navigation.navigate('ChatPage', {
            userId: item.firebaseUserId,
            name: item.name,
            myPhone,
            profilePicUrl: item.profilePic
          });
        } else {
          Alert.alert('Not Available', `${item.name} is not a registered user.`);
        }
      }}
      style={styles.contactContainer}
    >
      {item.profilePic ? (
        <Image
          source={{ uri: item.profilePic }}
          style={styles.profileImage}
          onError={(e) => console.log(`Failed to load image for ${item.name}: ${item.profilePic}`, e.nativeEvent.error)}
        />
      ) : (
        <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(item.name) }]}>
          <Text style={styles.profilePicText}>
            {item.name && typeof item.name === 'string' ? item.name.charAt(0).toUpperCase() : ''}
          </Text>
        </View>
      )}
      <View style={styles.contactDetails}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.phone}>{item.phone}</Text>
        {!item.isAppUser ? <Text style={styles.notRegistered}>Not on iChat</Text> : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#6B7280" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name or number"
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
        data={filteredContacts}
        keyExtractor={item => item.phone}
        renderItem={renderItem}
        contentContainerStyle={filteredContacts.length ? styles.listContent : styles.emptyListContent}
        ListHeaderComponent={filteredContacts.length ? <Text style={styles.sectionLabel}>PHONE CONTACTS</Text> : null}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <View style={styles.emptyIconCircle}><MaterialIcons name="people-outline" size={34} color="#2563EB" /></View>
            <Text style={styles.emptyTitle}>{isLoading ? 'Loading contacts' : contactsPermissionDenied ? 'Contacts permission needed' : searchText ? 'No matching contacts' : 'No contacts found'}</Text>
            <Text style={styles.emptyText}>
              {isLoading
                ? 'Getting contacts from your phone.'
                : contactsPermissionDenied
                  ? 'Allow contacts access in your device settings, then open this screen again.'
                  : searchText
                    ? 'Try a different name or phone number.'
                    : 'Add contacts to your phone, then try again.'}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F6F8FC' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginHorizontal: 16,
    marginTop: 14,
    marginBottom: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E5EBF8',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, height: 44, fontSize: 15, color: '#1F2937' },
  listContent: { paddingVertical: 16 },
  emptyListContent: { flexGrow: 1 },
  sectionLabel: { color: '#7D8796', fontSize: 12, fontWeight: '700', letterSpacing: 0.8, marginHorizontal: 22, marginBottom: 8 },
  contactContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#EDF0F5',
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
    fontWeight: '700',
  },
  profileImage: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 12,
    backgroundColor: '#f0f0f0',
  },
  contactDetails: { flex: 1 },
  name: { fontWeight: '700', fontSize: 16, color: '#1F2937' },
  phone: { color: '#667085', fontSize: 14, marginTop: 3 },
  notRegistered: { color: '#98A2B3', fontSize: 12, fontWeight: '600', marginTop: 3 },
  emptyState: { alignItems: 'center', justifyContent: 'center', flex: 1, paddingHorizontal: 44, paddingBottom: 64 },
  emptyIconCircle: { width: 74, height: 74, borderRadius: 37, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8F0FF', marginBottom: 18 },
  emptyTitle: { color: '#1F2937', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { textAlign: 'center', color: '#667085', fontSize: 15, lineHeight: 22 },
});
