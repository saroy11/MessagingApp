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
  TouchableOpacity,
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

  useEffect(() => {
    const fetchProfilePic = async () => {
      const user = auth.currentUser;
      if (!user) return;

      const userRef = doc(firestore, 'users', user.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists() && userSnap.data().profilePic) {
        setProfilePicUrl(userSnap.data().profilePic);
      }
    };
    fetchProfilePic();
  }, []);

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
      await signOut(auth);
      navigation.replace('Login');
    } catch (err) {
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
        <Text style={styles.userName}>{userName}</Text>

        {/* User Information */}
        <Text style={styles.infoText}>Phone: {myPhone}</Text>
        <Text style={styles.infoText}>Email: {userEmail}</Text>

        {/* Set Profile Picture Button */}
        <TouchableOpacity style={styles.setProfileButton} onPress={handleSetProfilePic} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#007AFF" />
          ) : (
            <Text style={styles.setProfileButtonText}>Set Profile Pic</Text>
          )}
        </TouchableOpacity>
      </View>
      
      <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f0f2f5',
    padding: 24,
  },
  profileCard: {
    width: '100%',
    alignItems: 'center',
    padding: 20,
    backgroundColor: 'white',
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  profilePicPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profilePicText: {
    color: 'white',
    fontSize: 48,
    fontWeight: 'bold',
  },
  profileImage: {
    width: 100,
    height: 100,
    borderRadius: 50,
  },
  userName: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginVertical: 10,
  },
  infoText: {
    fontSize: 18,
    color: '#555',
    marginBottom: 5,
  },
  setProfileButton: {
    padding: 10,
    marginTop: 10,
  },
  setProfileButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  logoutButton: {
    width: '100%',
    backgroundColor: '#FF3B30',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  logoutButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
