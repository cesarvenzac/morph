import { MorphPath } from '@morphfx/react-native'
import { StatusBar } from 'expo-status-bar'
import { useEffect, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, useColorScheme, View } from 'react-native'
import {
  Easing,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Svg from 'react-native-svg'
import { shapes } from './shapes'

const cycle = ['circle', 'square', 'star', 'heart', 'moon'] as const

export function App() {
  const dark = useColorScheme() === 'dark'
  const colors = dark
    ? {
        background: '#0e1016',
        card: '#161922',
        text: '#e7e9f0',
        muted: '#9aa1b5',
        shape: '#8d9bff',
      }
    : {
        background: '#f5f6f8',
        card: '#ffffff',
        text: '#161922',
        muted: '#596074',
        shape: '#2b3ad6',
      }

  const [playing, setPlaying] = useState(false)
  const [index, setIndex] = useState(0)
  const [completed, setCompleted] = useState(0)
  const name = cycle[index % cycle.length]

  // Controlled mode: the progress loops on the UI thread, React never re-renders.
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 2400, easing: Easing.inOut(Easing.cubic) }),
        withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.cubic) }),
      ),
      -1,
    )
  }, [progress])

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.page}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Text style={[styles.title, { color: colors.text }]}>morphfx + React Native</Text>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Toggle</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Tap to switch. Tap again mid-morph to reverse with momentum.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          testID="toggle"
          onPress={() => setPlaying((value) => !value)}
        >
          <Svg viewBox="0 0 100 100" width={96} height={96}>
            <MorphPath
              d={playing ? shapes.pause : shapes.play}
              transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
              fill={colors.text}
            />
          </Svg>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Interrupt</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>
          Each tap morphs to the next shape, from whatever is on screen.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Shape: ${name}. Tap for the next one.`}
          testID="cycle"
          onPress={() => setIndex((value) => value + 1)}
        >
          <Svg viewBox="0 0 100 100" width={96} height={96}>
            <MorphPath
              d={shapes[name]}
              fill={colors.shape}
              onMorphComplete={() => setCompleted((value) => value + 1)}
            />
          </Svg>
        </Pressable>
        <Text testID="cycle-status" style={{ color: colors.muted }}>
          {name} · {completed} morph{completed === 1 ? '' : 's'} completed
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.card }]}>
        <Text style={[styles.heading, { color: colors.text }]}>Controlled progress</Text>
        <Text style={[styles.hint, { color: colors.muted }]}>
          A shared value loops through four shapes on the UI thread.
        </Text>
        <Svg viewBox="0 0 100 100" width={96} height={96}>
          <MorphPath
            paths={[shapes.circle, shapes.square, shapes.star, shapes.heart]}
            progress={progress}
            fill="#0d9488"
          />
        </Svg>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  page: { padding: 16, paddingTop: 64, gap: 16 },
  title: { fontSize: 24, fontWeight: '700' },
  card: { padding: 16, borderRadius: 12, gap: 8 },
  heading: { fontSize: 17, fontWeight: '600' },
  hint: { fontSize: 14 },
})
