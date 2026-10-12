import { MaterialIcons } from '@expo/vector-icons';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { Component, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { auth, firestore } from './firebase'; // <-- CORRECTED IMPORT PATH
import ChatDetail from './screens/ChatDetail';
import ChatPage from './screens/ChatPage';
import ContactsScreen from './screens/ContactsScreen';
import GroupsScreen from './screens/GroupsScreen';
import LoginScreen from './screens/LoginScreen';
import RegisterScreen from './screens/RegisterScreen';
import SettingsScreen from './screens/SettingsScreen';
import StatusScreen from './screens/StatusScreen';
import { registerForPushNotifications } from './utils/notifications';

console.log('iChat: App module loaded');

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

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

const navTheme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: '#2563EB',
    background: '#F3F7FF',
    card: '#FFFFFF',
    text: '#111827',
    border: '#E7ECF6',
    notification: '#2563EB',
  },
};

const normalizePhoneNumber = (value) => {
  if (value === null || value === undefined) return '';
  const digits = String(value).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length > 10) return digits.slice(-10);
  return digits;
};

class AppErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('iChat render error:', error, errorInfo);
  }

  render() {
    if (this.state.error) {
      return (
        <View style={styles.errorContainer}>
          <MaterialIcons name="error-outline" size={42} color="#DC2626" />
          <Text style={styles.errorTitle}>iChat could not open</Text>
          <Text style={styles.errorMessage}>{this.state.error.message || String(this.state.error)}</Text>
        </View>
      );
    }

    return this.props.children;
  }
}

function MainTabs({ route }) {
  const { myPhone, userName, userEmail } = route.params;
  console.log('iChat: MainTabs rendered', { hasPhone: Boolean(myPhone), hasName: Boolean(userName) });

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ color, size }) => {
          let iconName;
          if (route.name === 'Chats') {
            iconName = 'chat';
          } else if (route.name === 'Groups') {
            iconName = 'groups';
          } else if (route.name === 'Status') {
            iconName = 'history';
          } else if (route.name === 'Settings') {
            iconName = 'settings';
          }
          return <MaterialIcons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563EB',
        tabBarInactiveTintColor: '#94A3B8',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E7ECF6',
          height: 72,
          paddingBottom: 8,
          paddingTop: 8,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.04,
          shadowRadius: 10,
          elevation: 4,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '700',
        },
      })}
    >
      <Tab.Screen
        name="Chats"
        component={ChatDetail}
        initialParams={{ myPhone }}
        options={{
          headerShown: false,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        initialParams={{ myPhone, userName, userEmail }}
        options={{
          headerShown: true,
          headerTitle: 'Settings',
          headerStyle: {
            backgroundColor: '#FFFFFF',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 2,
          },
          headerTitleStyle: {
            color: '#111827',
            fontWeight: '700',
            fontSize: 18,
          },
        }}
      />
      <Tab.Screen
        name="Status"
        component={StatusScreen}
        initialParams={{ myPhone, userName }}
        options={{
          headerShown: true,
          headerTitle: 'Status',
          headerStyle: {
            backgroundColor: '#FFFFFF',
            shadowColor: '#0F172A',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.04,
            shadowRadius: 8,
            elevation: 2,
          },
          headerTitleStyle: {
            color: '#111827',
            fontWeight: '700',
            fontSize: 18,
          },
        }}
      />
      <Tab.Screen
        name="Groups"
        component={GroupsScreen}
        initialParams={{ myPhone }}
        options={{ headerShown: true, headerTitle: 'Groups' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [initializing, setInitializing] = useState(true);
  const [user, setUser] = useState(null);

  console.log('iChat: root rendered', { initializing, hasUser: Boolean(user) });

  useEffect(() => {
    let isMounted = true;
    const initializationTimeout = setTimeout(() => {
      if (isMounted) {
        console.warn('Firebase Auth did not finish initializing; showing the login screen.');
        setInitializing(false);
      }
    }, 8000);

    const unsubscribe = onAuthStateChanged(auth, async (authUser) => {
      console.log('iChat: auth state received', { hasUser: Boolean(authUser) });
      try {
        if (!isMounted) return;
        if (authUser) {
          const q = query(collection(firestore, 'users'), where('email', '==', authUser.email));
          const querySnapshot = await getDocs(q);
          const userData = querySnapshot.empty ? null : querySnapshot.docs[0].data();
          const resolvedPhone = normalizePhoneNumber(userData?.phone ?? userData?.phoneRaw ?? authUser.phoneNumber ?? null);
          setUser({
            ...authUser,
            myPhone: resolvedPhone,
            name: userData?.name ?? null,
          });
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Unable to load the signed-in user profile:', error);
        setUser(authUser ? { ...authUser, myPhone: null, name: null } : null);
      } finally {
        if (isMounted) {
          clearTimeout(initializationTimeout);
          setInitializing(false);
        }
      }
    });

    return () => {
      isMounted = false;
      clearTimeout(initializationTimeout);
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    registerForPushNotifications(user.uid).catch((error) => {
      console.warn('Push notification registration failed:', error.message);
    });
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const updatePresence = (isOnline) => setDoc(doc(firestore, 'users', user.uid), {
      isOnline,
      lastSeen: serverTimestamp(),
    }, { merge: true }).catch((error) => console.warn('Presence update failed:', error.code));

    updatePresence(true);
    const subscription = AppState.addEventListener('change', (state) => updatePresence(state === 'active'));
    return () => {
      subscription.remove();
      updatePresence(false);
    };
  }, [user?.uid]);

  useEffect(() => {
    if (!initializing) {
      SplashScreen.hide();
    }
  }, [initializing]);

  if (initializing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#2563EB" />
        <Text style={styles.loadingText}>Starting iChat…</Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <View style={styles.appContainer}>
        <View style={styles.navigationHost}>
          <NavigationContainer theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <>
            <Stack.Screen
              name="MainTabs"
              component={MainTabs}
              initialParams={{ myPhone: user.myPhone, userName: user.name, userEmail: user.email }}
            />
            <Stack.Screen
              name="ChatPage"
              component={ChatPage}
              options={({ navigation }) => ({
                headerShown: true,
                headerTitle: ({ children }) => {
                  const { userId, name } = navigation.getState().routes.find(r => r.name === 'ChatPage')?.params || {};
                  const initial = name ? name.charAt(0).toUpperCase() : '';
                  return (
                    <View style={styles.headerTitleContainer}>
                      <View style={[styles.profilePicPlaceholder, { backgroundColor: getRandomColor(userId) }]}>
                        <Text style={styles.profilePicText}>{initial}</Text>
                      </View>
                      <Text style={styles.headerTitle}>{children}</Text>
                    </View>
                  );
                },
                headerLeft: () => (
                  <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 16 }}>
                    <MaterialIcons name="arrow-back" size={28} color="#2563EB" />
                  </TouchableOpacity>
                ),
                headerStyle: {
                  backgroundColor: '#FFFFFF',
                  shadowColor: '#0F172A',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  elevation: 2,
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
                    <MaterialIcons name="arrow-back" size={28} color="#2563EB" />
                  </TouchableOpacity>
                ),
                headerTitle: 'Select Contact',
                headerStyle: {
                  backgroundColor: '#FFFFFF',
                },
                headerTitleStyle: {
                  color: '#111827',
                  fontWeight: '700',
                },
              })}
            />
          </>
        ) : (
          <>
            <Stack.Screen name="Login" component={LoginScreen} />
            <Stack.Screen name="Register" component={RegisterScreen} />
          </>
        )}
          </Stack.Navigator>
          </NavigationContainer>
        </View>
      </View>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  appContainer: {
    flex: 1,
    backgroundColor: '#F3F7FF',
  },
  navigationContainer: {
    flex: 1,
  },
  navigationHost: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F7FF',
  },
  loadingText: {
    marginTop: 12,
    color: '#475467',
    fontSize: 16,
    fontWeight: '600',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    backgroundColor: '#F3F7FF',
  },
  errorTitle: {
    marginTop: 14,
    color: '#111827',
    fontSize: 22,
    fontWeight: '700',
  },
  errorMessage: {
    marginTop: 10,
    color: '#475467',
    fontSize: 14,
    textAlign: 'center',
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
    fontWeight: '700',
  },
  headerTitle: {
    color: '#000',
    fontSize: 20,
    fontWeight: '700',
  },
});
