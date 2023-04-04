import * as _ from 'underscore'

export const AHKKeyboardMap = {
	'½': ['SC029', '{vkDCsc029}'],
	f1: ['F1', '{F1}'],
	f2: ['F2', '{F2}'],
	f3: ['F3', '{F3}'],
	f4: ['F4', '{F4}'],
	f5: ['F5', '{F5}'],
	f6: ['F6', '{F6}'],
	f7: ['F7', '{F7}'],
	f8: ['F8', '{F8}'],
	f9: ['F9', '{F9}'],
	f10: ['F10', '{F10}'],
	f11: ['F11', '{F11}'],
	f12: ['F12', '{F12}'],
	'!': ['!', '{!}'],
	'#': ['#', '{#}'],
	add: ['+', '{+}'],
	comma: ['SC033', '{,}'],
	period: '.',
	'^': ['^', '{^}'],
	'{': ['{', '{{}'],
	'}': ['}', '{}}'],
	enter: ['Enter', '{Enter}'],
	esc: ['Escape', '{Escape}'],
	space: ['Space', '{Space}'],
	tab: ['Tab', '{Tab}'],
	backspace: ['Backspace', '{Backspace}'],
	del: ['Delete', '{Delete}'],
	ins: ['Insert', '{Insert}'],
	arrowup: ['Up', '{Up}'],
	arrowdown: ['Down', '{Down}'],
	arrowleft: ['Left', '{Left}'],
	arrowright: ['Right', '{Right}'],
	home: ['Home', '{Home}'],
	end: ['End', '{End}'],
	pageup: ['PgUp', '{PgUp}'],
	pagedown: ['PgDn', '{PgDn}'],
	capslock: ['CapsLock', '{CapsLock}'],
	numlock: ['NumLock', '{NumLock}'],
	scrolllock: ['ScrollLock', '{ScrollLock}'],
	num0: ['Numpad0', '{Numpad0}'],
	num1: ['Numpad1', '{Numpad1}'],
	num2: ['Numpad0', '{Numpad0}'],
	num3: ['Numpad0', '{Numpad0}'],
	num4: ['Numpad0', '{Numpad0}'],
	num5: ['Numpad0', '{Numpad0}'],
	num6: ['Numpad0', '{Numpad0}'],
	num7: ['Numpad0', '{Numpad0}'],
	num8: ['Numpad0', '{Numpad0}'],
	num9: ['Numpad0', '{Numpad0}'],
	numadd: ['NumpadAdd', '{NumpadAdd}'],
	numsub: ['NumpadSub', '{NumpadSub}'],
	nummul: ['NumpadMult', '{NumpadMult}'],
	numdiv: ['NumpadDiv', '{NumpadDiv}'],
}

export const AHKModifierMap = {
	ctrl: '^',
	shift: '+',
	alt: '!',
	cmd: '#',
}

export const AHKBaseHeader = [
	'#NoEnv',
	'SendMode Input',
	'SetWorkingDir %A_ScriptDir%',
	'',
	'#IfWinActive, ahk_class Chrome_WidgetWin_1',
	'',
]

export const useAHKComboTemplate = _.template('<%=platformKeyCombo%> up:: send <%=browserKeyCombo%>')
