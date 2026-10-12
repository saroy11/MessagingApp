import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { signOut } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  Switch,
  View,
} from 'react-native';
import { auth, firestore } from '../firebase';

// !!! IMPORTANT: Replace with your actual Cloudinary credentials !!!
const CLOUDINARY_CLOUD_NAME = 'dy6fcosvb';
const CLOUDINARY_UPLOAD_PRESET = 'iChatUpload';

// Helper functions for the profile circle
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

export default function SettingsScreen({ route, navigation }) {
  const { userName, myPhone, userEmail } = route.params;
  const [profilePicUrl, setProfilePicUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [lastSeenEnabled, setLastSeenEnabled] = useState(true);
  const [blockedPhones, setBlockedPhones] = useState([]);
  const [blockNumber, setBlockNumber] = useState('');

  useEffect(() => {
    const fetchProfilePic = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userRef = doc(firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        if (data.profilePic) setProfilePicUrl(data.profilePic);
        setLastSeenEnabled(data.lastSeenEnabled !== false);
        setBlockedPhones(data.blockedPhones || []);
      }
    };
    fetchProfilePic();
  }, []);

  const normalizePhone = (value) => {
    const digits = String(value || '').replace(/\D/g, '');
    return digits.length > 10 ? digits.slice(-10) : digits;
  };

  const savePrivacy = async (updates) => {
    const user = auth.currentUser;
    if (!user) return;
    try {
      await setDoc(doc(firestore, 'users', user.uid), updates, { merge: true });
    } catch (error) {
      Alert.alert('Could not save privacy setting', error.message || 'Please try again.');
    }
  };

  const toggleLastSeen = (value) => {
    setLastSeenEnabled(value);
    savePrivacy({ lastSeenEnabled: value });
  };

  const blockPhone = () => {
    const phone = normalizePhone(blockNumber);
    if (phone.length !== 10 || phone === normalizePhone(myPhone)) {
      Alert.alert('Enter a valid contact number', 'Use a 10-digit number other than your own.');
      return;
    }
    const updated = [...new Set([...blockedPhones, phone])];
    setBlockedPhones(updated);
    setBlockNumber('');
    savePrivacy({ blockedPhones: updated });
  };

  const unblockNumber = (phone) => {
    const updated = blockedPhones.filter((blockedPhone) => blockedPhone !== phone);
    setBlockedPhones(updated);
    savePrivacy({ blockedPhones: updated });
  };

  const handleSetProfilePic = async () => {
    try {
      if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_UPLOAD_PRESET) {
        Alert.alert('Configuration Error', 'Please add your Cloudinary credentials to SettingsScreen.js.');
        return;
      }

      // 1. Request permissions
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Please enable media library access in your phone settings to set a profile picture.');
        return;
      }

      // 2. Pick an image from the library
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      });

      if (!result.canceled) {
        const imageUri = result.assets[0].uri;
        setLoading(true);

        // 3. Prepare the image for upload
        const formData = new FormData();
        formData.append('file', {
          uri: imageUri,
          type: 'image/jpeg',
          name: `profile_pic_${Date.now()}.jpg`,
        });
        formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);

        // 4. Upload to Cloudinary
        const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
        const response = await fetch(cloudinaryUrl, {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();
        if (data.secure_url) {
          const newUrl = data.secure_url;
          setProfilePicUrl(newUrl);

          // 5. Update the logged-in user's Firestore document
          const user = auth.currentUser;
          if (!user) {
            Alert.alert('Error', 'No authenticated user found.');
            return;
          }

          const userRef = doc(firestore, "users", auth.currentUser.uid);
          await setDoc(userRef, { profilePic: newUrl }, { merge: true });


          Alert.alert('Success', 'Profile picture updated successfully!');
        } else {
          Alert.alert('Error', 'Failed to get image URL from Cloudinary. Please try again.');
          console.error('Cloudinary upload response:', data);
        }
      }
    } catch (err) {
      console.error(err);
      Alert.alert('Error', 'Failed to set profile picture. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      if (!auth.currentUser) {
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
      await signOut(auth);
    } catch (_err) {
      Alert.alert('Logout Failed', 'Could not log out. Please try again.');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.profileCard}>
        {/* Profile Circle or Image */}
        {profilePicUrl ? (
          <Image source={{ uri: profilePicUrl }} style={styles.profileImage} />
        ) : (
          <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(myPhone) }]}>
            <Text style={styles.profilePicText}>
              {userName ? userName.charAt(0).toUpperCase() : ''}
            </Text>
          </View>
        )}

        {/* User Name */}
        <Text style={styles.userName}>{userName || 'iChat user'}</Text>
        <Text style={styles.profileHint}>Your iChat profile</Text>

        <View style={styles.accountCard}>
          <View style={styles.infoRow}>
            <MaterialIcons name="phone" size={19} color="#667085" />
            <View>
              <Text style={styles.infoLabel}>PHONE</Text>
              <Text style={styles.infoText}>{myPhone}</Text>
            </View>
          </View>
          <View style={styles.infoDivider} />
          <View style={styles.infoRow}>
            <MaterialIcons name="alternate-email" size={19} color="#667085" />
            <View>
              <Text style={styles.infoLabel}>ACCOUNT EMAIL</Text>
              <Text style={styles.infoText}>{userEmail}</Text>
            </View>
          </View>
        </View>

        {/* Set Profile Picture Button */}
        <TouchableOpacity style={styles.setProfileButton} onPress={handleSetProfilePic} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <><MaterialIcons name="photo-camera" size={18} color="#2563EB" /><Text style={styles.setProfileButtonText}>Change profile photo</Text></>
          )}
        </TouchableOpacity>

        <View style={styles.privacyCard}>
          <Text style={styles.privacyTitle}>Privacy</Text>
          <View style={styles.privacyRow}>
            <View><Text style={styles.privacyRowTitle}>Last seen and online</Text><Text style={styles.privacyHint}>Let people see when you are active.</Text></View>
            <Switch value={lastSeenEnabled} onValueChange={toggleLastSeen} trackColor={{ false: '#D0D5DD', true: '#93C5FD' }} thumbColor={lastSeenEnabled ? '#2563EB' : '#F9FAFB'} />
          </View>
          <Text style={styles.blockTitle}>Blocked contacts</Text>
          <View style={styles.blockInputRow}>
            <TextInput value={blockNumber} onChangeText={setBlockNumber} placeholder="Phone number" keyboardType="phone-pad" style={styles.blockInput} />
            <TouchableOpacity style={styles.blockButton} onPress={blockPhone}><Text style={styles.blockButtonText}>Block</Text></TouchableOpacity>
          </View>
          {blockedPhones.map((phone) => <View style={styles.blockedRow} key={phone}><Text style={styles.infoText}>{phone}</Text><TouchableOpacity onPress={() => unblockNumber(phone)}><Text style={styles.unblockText}>Unblock</Text></TouchableOpacity></View>)}
        </View>
      </View>
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <MaterialIcons name="logout" size={20} color="#DC2626" />
        <Text style={styles.logoutButtonText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F3F7FF',
    padding: 20,
  },
  profileCard: {
    width: '100%',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#E7ECF6',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 18,
    elevation: 4,
  },
  profilePicPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
  },
  profilePicText: {
    color: 'white',
    fontSize: 48,
    fontWeight: '700',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#E7ECF6',
  },
  userName: {
    fontSize: 24,
    fontWeight: '800',
    marginTop: 14,
    color: '#111827',
  },
  profileHint: { color: '#7D8796', fontSize: 14, marginTop: 4, marginBottom: 20 },
  accountCard: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E7ECF6',
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  infoLabel: { color: '#8A94A3', fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  infoText: { fontSize: 14, color: '#344054' },
  infoDivider: { height: 1, backgroundColor: '#E8ECF3', marginLeft: 31 },
  setProfileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#C9D8FF',
    backgroundColor: '#F5F8FF',
  },
  privacyCard: { width: '100%', marginTop: 18, backgroundColor: '#F8FAFC', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E7ECF6' },
  privacyTitle: { color: '#1F2937', fontSize: 16, fontWeight: '800', marginBottom: 12 },
  privacyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  privacyRowTitle: { color: '#344054', fontSize: 14, fontWeight: '700' },
  privacyHint: { color: '#7D8796', fontSize: 12, marginTop: 3, maxWidth: 220 },
  blockTitle: { color: '#344054', fontSize: 14, fontWeight: '700', marginTop: 18, marginBottom: 8 },
  blockInputRow: { flexDirection: 'row', gap: 8 },
  blockInput: { flex: 1, height: 42, paddingHorizontal: 10, borderWidth: 1, borderColor: '#DCE3EF', backgroundColor: '#FFFFFF', borderRadius: 10, fontSize: 14 },
  blockButton: { backgroundColor: '#DC2626', borderRadius: 10, paddingHorizontal: 13, justifyContent: 'center' },
  blockButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  blockedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 11 },
  unblockText: { color: '#2563EB', fontWeight: '700', fontSize: 13 },
  setProfileButtonText: {
    color: '#2563EB',
    fontSize: 15,
    fontWeight: '700',
  },
  logoutButton: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FFF5F5',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 20,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  logoutButtonText: {
    color: '#DC2626',
    fontSize: 16,
    fontWeight: '700',
  },
});
