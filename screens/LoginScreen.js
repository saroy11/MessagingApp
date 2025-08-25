import { onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, firestore } from '../firebase';

export default function LoginScreen({ navigation }) {
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        navigation.replace('ChatDetail', { myPhone: user.phone || phone });
      }
    });
    return unsubscribe;
  }, [navigation]);

  const handleLogin = async () => {
    try {
      const q = query(collection(firestore, 'users'), where('phone', '==', Number(phone)));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        Alert.alert('Login Failed', 'No user found with this phone number.');
        return;
      }
      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data();
      await signInWithEmailAndPassword(auth, userData.email, password);
      navigation.replace('ChatDetail', { myPhone: userData.phone });
    } catch (err) {
      console.log(err);
      Alert.alert('Login Failed', err.message || 'Unknown error');
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>iChat</Text>
      <View style={styles.inputContainer}>
        <TextInput
          placeholder="Phone"
          value={phone}
          onChangeText={setPhone}
          style={styles.input}
          keyboardType="phone-pad"
        />
        <TextInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          secureTextEntry
        />
      </View>
      <TouchableOpacity style={styles.button} onPress={handleLogin}>
        <Text style={styles.buttonText}>Login</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={() => navigation.navigate('Register')}>
        <Text style={styles.registerText}>Don't have an account? <Text style={styles.registerLink}>Register</Text></Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: '#f0f2f5',
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#007AFF',
    marginBottom: 40,
  },
  inputContainer: {
    width: '100%',
    marginBottom: 20,
  },
  input: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 10,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ccc',
    marginBottom: 16,
  },
  button: {
    width: '100%',
    backgroundColor: '#007AFF',
    padding: 18,
    borderRadius: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  registerText: {
    fontSize: 16,
    color: '#666',
  },
  registerLink: {
    color: '#007AFF',
    fontWeight: 'bold',
  },
});