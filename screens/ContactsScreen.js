import * as Contacts from 'expo-contacts';
import { collection, getDocs } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, FlatList, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
  const myPhone = route?.params?.myPhone;

  const normalizePhone = (phone) => {
    let phoneStr = (phone === null || phone === undefined) ? '' : String(phone).trim();
    if (!phoneStr) {
      console.warn('Invalid phone number input:', phone);
      return '';
    }
    let normalized = phoneStr.replace(/[^0-9+]/g, '');
    if (normalized.length === 10 && !normalized.startsWith('+')) {
      normalized = `+91${normalized}`;
    } else if (normalized.startsWith('0') && normalized.length === 11) {
      normalized = `+91${normalized.slice(1)}`;
    } else if (!normalized.startsWith('+') && normalized.length > 0) {
      console.warn(`Unexpected phone format, normalizing as-is: ${phoneStr}, result: ${normalized}`);
    }
    if (!normalized) {
      console.warn(`Normalization failed for phone: ${phoneStr}`);
    }
    return { normalized, raw: normalized.replace('+91', '') };
  };

  useEffect(() => {
    const fetchPhoneContacts = async () => {
      try {
        const { status } = await Contacts.requestPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Please allow access to contacts to proceed.');
          return;
        }
        const { data } = await Contacts.getContactsAsync({
          fields: [Contacts.Fields.Name, Contacts.Fields.PhoneNumbers],
        });

        const querySnapshot = await getDocs(collection(firestore, 'users'));
        const phoneToProfilePic = {};
        const registeredPhones = new Set();
        querySnapshot.docs.forEach(doc => {
          const userData = doc.data();
          let phoneKey = null;
          if (doc.id.length === 10 && doc.id.match(/^\d{10}$/)) {
            phoneKey = doc.id;
          }
          if (userData.phone) {
            phoneKey = String(userData.phone).replace('+91', '');
          }
          if (phoneKey) {
            registeredPhones.add(phoneKey);
            if (userData.profilePic) {
              phoneToProfilePic[phoneKey] = userData.profilePic;
            }
          }
          console.log('Firebase document:', { id: doc.id, data: userData, phoneKey, profilePic: userData.profilePic });
        });

        console.log('Registered phones:', Array.from(registeredPhones));
        console.log('Phone to profilePic map:', phoneToProfilePic);

        const filteredContacts = data
          .filter(contact => contact.phoneNumbers?.length > 0 && contact.phoneNumbers[0]?.number)
          .map(contact => {
            const rawPhone = contact.phoneNumbers[0].number;
            const phoneData = normalizePhone(rawPhone);
            if (!phoneData.normalized) {
              console.warn(`Contact ${contact.name || 'Unknown'} has invalid phone number: ${rawPhone}`);
              return null;
            }
            const rawPhoneKey = phoneData.raw;
            const isAppUser = registeredPhones.has(rawPhoneKey);
            const profilePic = isAppUser ? phoneToProfilePic[rawPhoneKey] || null : null;
            console.log('Contact match:', {
              contactName: contact.name,
              contactPhone: phoneData.normalized,
              rawPhoneKey,
              isAppUser,
              profilePic,
            });
            return {
              id: contact.id,
              name: contact.name || 'Unknown',
              phone: phoneData.normalized,
              isAppUser,
              firebaseUserId: isAppUser ? phoneData.normalized : null,
              profilePic,
            };
          })
          .filter(contact => contact !== null && contact.isAppUser);

        console.log('Final contacts:', filteredContacts.map(c => ({
          name: c.name,
          phone: c.phone,
          profilePic: c.profilePic,
        })));
        setContacts(filteredContacts);
      } catch (err) {
        console.error('Error fetching contacts:', err);
        Alert.alert('Error', 'Failed to fetch contacts: ' + err.message);
      }
    };

    fetchPhoneContacts();
  }, [myPhone]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      onPress={() => {
        if (item.isAppUser && item.firebaseUserId) {
          navigation.goBack();
          navigation.navigate('ChatPage', { userId: item.firebaseUserId, name: item.name, myPhone });
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
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={contacts}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ListEmptyComponent={<Text style={styles.emptyText}>No registered contacts found</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'white' },
  contactContainer: {
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
  contactDetails: { flex: 1 },
  name: { fontWeight: 'bold', fontSize: 16 },
  phone: { color: '#555' },
  emptyText: { textAlign: 'center', marginTop: 20, color: '#555' },
});