import { useMemo, useState } from 'react'
import { saveCustomExercise, uuid } from '../data/repo'
import { allExercises } from '../domain/catalog'
import type { Category, Equipment, ExerciseDef } from '../domain/types'
import { useCustomExercises } from './data'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

const GROUPS: { cat: Category; label: string }[] = [
  { cat: 'PUSH', label: 'Chest, shoulders and triceps' },
  { cat: 'PULL', label: 'Back and biceps' },
  { cat: 'LEGS', label: 'Legs' },
  { cat: 'MOBILITY', label: 'Core' },
]

const EQUIPMENT: { v: Equipment; label: string }[] = [
  { v: 'BARBELL', label: 'Barbell' },
  { v: 'DUMBBELL', label: 'Dumbbell' },
  { v: 'CABLE', label: 'Cable' },
  { v: 'MACHINE', label: 'Machine' },
  { v: 'BODYWEIGHT', label: 'Body' },
]

/** Searchable list of strength exercises, with "create your own". */
export function ExercisePicker({ title = 'Add exercise', onPick, onClose }: { title?: string; onPick: (id: string) => void; onClose: () => void }) {
  useCustomExercises() // re-render when custom exercises change
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const list = useMemo(
    () => allExercises().filter((e) => (e.tracking_archetype === 'WEIGHT_REPS' || e.tracking_archetype === 'BODYWEIGHT_REPS') && e.name.toLowerCase().includes(q.trim().toLowerCase())),
    [q, creating],
  )

  if (creating) return <CreateExercise initialName={q} onClose={() => setCreating(false)} onCreated={(id) => onPick(id)} />

  return (
    <Sheet title={title} onClose={onClose} right={<button className="btn ghost" onClick={onClose}>Cancel</button>}>
      <div className="row" style={{ background: 'var(--surface-3)', borderRadius: 10, padding: '0 10px', marginBottom: 12 }}>
        <Icon name="search" size={17} className="faint" />
        <input className="input" style={{ background: 'transparent', height: 38, padding: 0 }} placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      </div>
      {GROUPS.map((g) => {
        const items = list.filter((e) => e.category === g.cat || (g.cat === 'MOBILITY' && !GROUPS.some((x) => x.cat === e.category)))
        if (!items.length) return null
        return (
          <div key={g.cat}>
            <div className="group-header">{g.label}</div>
            <div className="card list">
              {items.map((e) => (
                <button key={e.id} className="cell" onClick={() => onPick(e.id)}>
                  <span className="grow">{e.name}</span>
                  <span className="tiny muted">{EQUIPMENT.find((x) => x.v === e.equipment)?.label ?? ''}</span>
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <div className="card" style={{ marginTop: 16 }}>
        <button className="cell" style={{ color: 'var(--tint)' }} onClick={() => setCreating(true)}>
          <Icon name="plus" /> Create “{q.trim() || 'new exercise'}”
        </button>
      </div>
    </Sheet>
  )
}

export function CreateExercise({ initialName = '', onClose, onCreated }: { initialName?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState(initialName)
  const [equipment, setEquipment] = useState<Equipment>('DUMBBELL')
  const [category, setCategory] = useState<Category>('PUSH')
  const save = async () => {
    const def: ExerciseDef = {
      id: `custom_${uuid()}`,
      name: name.trim(),
      category,
      tracking_archetype: equipment === 'BODYWEIGHT' ? 'BODYWEIGHT_REPS' : 'WEIGHT_REPS',
      equipment,
      primary_muscles: [],
      progression_type: equipment === 'BODYWEIGHT' ? 'NONE' : 'DOUBLE',
      default_rest_sec: equipment === 'BARBELL' ? 150 : 90,
      substitutions: [],
      per_hand: equipment === 'DUMBBELL',
    }
    await saveCustomExercise(def)
    onCreated(def.id)
  }
  return (
    <Sheet
      title="New exercise"
      onClose={onClose}
      left={<button className="btn ghost" onClick={onClose}>Cancel</button>}
      right={<button className="btn ghost" style={{ fontWeight: 600 }} disabled={!name.trim()} onClick={() => void save()}>Add</button>}
    >
      <input className="input" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      <div className="group-header">Equipment</div>
      <div className="seg block">
        {EQUIPMENT.map((e) => (
          <button key={e.v} aria-pressed={equipment === e.v} onClick={() => setEquipment(e.v)}>{e.label}</button>
        ))}
      </div>
      <div className="group-header">Body area</div>
      <div className="seg block">
        {GROUPS.map((g) => (
          <button key={g.cat} aria-pressed={category === g.cat} onClick={() => setCategory(g.cat)}>{g.label.split(',')[0].split(' and ')[0]}</button>
        ))}
      </div>
      <p className="group-footer">
        {equipment === 'BODYWEIGHT'
          ? 'Logged as reps. Add or subtract weight for assisted or weighted sets.'
          : 'Uses rep ranges: once every set hits the top of the range, the weight goes up.'}
      </p>
    </Sheet>
  )
}
