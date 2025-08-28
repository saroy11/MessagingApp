import { signOut } from 'firebase/auth';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth } from '../firebase';

// Helper functions for the profile circle (copied from App.js/ChatDetail.js)
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
        {/* Profile Circle with User's Initial */}
        <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(myPhone) }]}>
          <Text style={styles.profilePicText}>
            {userName ? userName.charAt(0).toUpperCase() : ''}
          </Text>
        </View>

        {/* User Name */}
        <Text style={styles.userName}>{userName}</Text>

        {/* User Information */}
        <Text style={styles.infoText}>Phone: {myPhone}</Text>
        <Text style={styles.infoText}>Email: {userEmail}</Text>

        {/* Set Profile Picture Button */}
        <TouchableOpacity style={styles.setProfileButton}>
          <Text style={styles.setProfileButtonText}>Set Profile Pic</Text>
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