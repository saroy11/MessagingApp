import { MaterialIcons } from '@expo/vector-icons';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, firestore } from './firebase';
import ChatDetail from './screens/ChatDetail';
import ChatPage from './screens/ChatPage';
import ContactsScreen from './screens/ContactsScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';

const Stack = createStackNavigator();

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

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      setUser(authUser);
      if (authUser) {
        const q = query(collection(firestore, 'users'), where('email', '==', authUser.email));
        const querySnapshot = await getDocs(q);
        if (!querySnapshot.empty) {
          const userData = querySnapshot.docs[0].data();
          setUser({ ...authUser, myPhone: userData.phone, name: userData.name });
        } else {
          setUser({ ...authUser, myPhone: null, name: null });
        }
      }
      if (initializing) {
        setInitializing(false);
      }
    });
    return unsubscribe;
  }, []);

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName={user && user.myPhone ? 'ChatDetail' : 'Login'} screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={LoginScreen} />
        <Stack.Screen name="Register" component={RegisterScreen} />
        <Stack.Screen
          name="ChatPage"
          component={ChatPage}
          options={({ route, navigation }) => ({
            headerShown: true,
            headerTitle: () => (
              <View style={styles.headerTitleContainer}>
                <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(route.params?.userId) }]}>
                  <Text style={styles.profilePicText}>
                    {(route.params?.name)?.charAt(0)?.toUpperCase() || 'i'}
                  </Text>
                </View>
                <Text style={styles.headerTitle}>{route.params?.name || 'Chat'}</Text>
              </View>
            ),
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 16 }}>
                <MaterialIcons name="arrow-back" size={28} color="#007AFF" />
              </TouchableOpacity>
            ),
            headerStyle: {
              backgroundColor: 'white',
            },
          })}
        />
        <Stack.Screen
          name="Contacts"
          component={ContactsScreen}
          options={({ navigation }) => ({
            presentation: 'modal',
            headerShown: true,
            headerLeft: () => (
              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 16 }}>
                <MaterialIcons name="arrow-back" size={28} color="#007AFF" />
              </TouchableOpacity>
            ),
            headerTitle: 'Select Contact',
          })}
        />
        <Stack.Screen
          name="ChatDetail"
          component={ChatDetail}
          initialParams={{ myPhone: user ? user.myPhone : null }}
          options={{
            headerShown: false,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  profilePicPlaceholder: {
    width: 35,
    height: 35,
    borderRadius: 17.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  profilePicText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerTitle: {
    color: 'black',
    fontSize: 20,
    fontWeight: 'bold',
  },
});