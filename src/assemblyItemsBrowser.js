'use strict'
var React = require('react')
var BasicPanel = require('./basicPanel')
var Sticker = require('./sticker')
var ButtonNavigator = require('./vmTraceButtonNavigator')
var codeUtils = require('./codeUtils')
var style = require('./basicStyles')
var Slider = require('./slider')

module.exports = React.createClass({
  contextTypes: {
    web3: React.PropTypes.object
  },

  getInitialState: function () {
    return {
      currentSelected: -1, // current selected item in the vmTrace
      selectedInst: -1, // current selected item in the contract assembly code
      currentAddress: null,
      currentStack: null,
      currentLevels: null,
      currentStorage: null,
      currentMemory: null,
      currentCallData: null,
      currentStepInfo: null,
      codes: {}, // assembly items instructions list by contract addesses
      instructionsIndexByBytesOffset: {}, // mapping between bytes offset and instructions index.
      callStack: {}
    }
  },

  getDefaultProps: function () {
    return {
      vmTrace: null
    }
  },

  render: function () {
    return (
      <div style={this.props.vmTrace === null ? style.hidden : style.display}>
        <div style={style.container}>
          <span style={style.address}>Current code: {this.state.currentAddress}</span>
        </div>
        <div style={style.container}>
          <Slider
            ref='slider'
            onChange={this.selectState}
            min='0'
            max={this.props.vmTrace ? this.props.vmTrace.length : 0} />
          <ButtonNavigator
            vmTraceLength={this.props.vmTrace ? this.props.vmTrace.length : 0}
            step={this.state.currentSelected}
            stepIntoBack={this.stepIntoBack}
            stepIntoForward={this.stepIntoForward}
            stepOverBack={this.stepOverBack}
            stepOverForward={this.stepOverForward} />
        </div>
        <div style={style.container}>
          <table>
            <tbody>
              <tr>
                <td>
                  <select
                    size='10'
                    ref='itemsList'
                    style={style.instructionsList}
                    value={this.state.selectedInst}>
                    {this.renderAssemblyItems()}
                  </select>
                  <div style={Object.assign(style.inline, style.sticker)}>
                    <Sticker data={this.state.currentStepInfo} />
                  </div>
                </td>
                <td>
                  <BasicPanel name='CallData' data={this.state.currentCallData} />
                </td>
              </tr>
              <tr>
                <td>
                  <BasicPanel name='Stack' data={this.state.currentStack} />
                </td>
                <td>
                  <BasicPanel name='CallStack' data={this.state.currentCallStack} />
                </td>
              </tr>
              <tr>
                <td>
                  <BasicPanel name='Storage' data={this.state.currentStorage} renderRow={this.renderStorageRow} />
                </td>
                <td>
                  <BasicPanel name='Memory' data={this.state.currentMemory} renderRow={this.renderMemoryRow} />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    )
  },

  renderStorageRow: function (data) {
    var ret = []
    if (data) {
      for (var key in data) {
        ret.push(
          <tr key={key}>
            <td>
              {key}
            </td>
            <td>
              {data[key]}
            </td>
          </tr>)
      }
    }
    return ret
  },

  renderMemoryRow: function (data) {
    var ret = []
    if (data) {
      for (var key in data) {
        var memSlot = data[key]
        ret.push(
          <tr key={key}>
            <td>
              {memSlot.address}
            </td>
            <td>
              {memSlot.content.raw}
            </td>
            <td>
              {memSlot.content.ascii}
            </td>
          </tr>)
      }
    }
    return ret
  },

  resolveAddress: function (address) {
    if (!this.state.codes[address]) {
      var hexCode = this.context.web3.eth.getCode(address)
      var code = codeUtils.nameOpCodes(new Buffer(hexCode.substring(2), 'hex'))
      this.state.codes[address] = code[0]
      this.state.instructionsIndexByBytesOffset[address] = code[1]
    }
  },

  renderAssemblyItems: function () {
    if (this.props.vmTrace) {
      return this.state.codes[this.state.currentAddress].map(function (item, i) {
        return <option key={i} value={i}>{item}</option>
      })
    }
  },

  componentWillReceiveProps: function (nextProps) {
    if (!nextProps.vmTrace) {
      return
    }
    this.buildCallStack(nextProps.vmTrace)
    this.setState({'currentSelected': -1})
    this.updateState(nextProps, 0)
  },

  buildCallStack: function (vmTrace) {
    if (!vmTrace) {
      return
    }
    var callStack = []
    var depth = -1
    for (var k = 0; k < vmTrace.length; k++) {
      var trace = vmTrace[k]
      if (trace.depth === undefined || trace.depth === depth) {
        continue
      }
      if (trace.depth > depth) {
        callStack.push(trace.address) // new context
      } else if (trace.depth < depth) {
        callStack.pop() // returning from context
      }
      depth = trace.depth
      this.state.callStack[k] = callStack.slice(0)
    }
  },

  updateState: function (props, vmTraceIndex) {
    if (!props.vmTrace || !props.vmTrace[vmTraceIndex]) {
      return
    }
    var previousIndex = this.state.currentSelected
    var stateChanges = {}

    if (props.vmTrace[vmTraceIndex].stack) { // there's always a stack
      var stack = props.vmTrace[vmTraceIndex].stack
      stack.reverse()
      stateChanges['currentStack'] = stack
    }

    var currentAddress = this.state.currentAddress
    var addressIndex = this.shouldUpdateStateProperty('address', vmTraceIndex, previousIndex, props.vmTrace)
    if (addressIndex > -1) {
      currentAddress = props.vmTrace[addressIndex].address
      this.resolveAddress(currentAddress)
      Object.assign(stateChanges, { 'currentAddress': currentAddress })
    }

    var depthIndex = this.shouldUpdateStateProperty('depth', vmTraceIndex, previousIndex, props.vmTrace)
    if (depthIndex > -1) {
      Object.assign(stateChanges, { 'currentCallStack': this.state.callStack[depthIndex] })
    }

    var storageIndex = this.shouldUpdateStateProperty('storage', vmTraceIndex, previousIndex, props.vmTrace)
    if (storageIndex > -1) {
      Object.assign(stateChanges, { 'currentStorage': props.vmTrace[storageIndex].storage })
    }

    var memoryIndex = this.shouldUpdateStateProperty('memory', vmTraceIndex, previousIndex, props.vmTrace)
    if (memoryIndex > -1) {
      Object.assign(stateChanges, { 'currentMemory': this.formatMemory(props.vmTrace[memoryIndex].memory, 16) })
    }

    var callDataIndex = this.shouldUpdateStateProperty('calldata', vmTraceIndex, previousIndex, props.vmTrace)
    if (callDataIndex > -1) {
      Object.assign(stateChanges, { 'currentCallData': [props.vmTrace[callDataIndex].calldata] })
    }

    stateChanges['selectedInst'] = this.state.instructionsIndexByBytesOffset[currentAddress][props.vmTrace[vmTraceIndex].pc]
    stateChanges['currentSelected'] = vmTraceIndex

    stateChanges['currentStepInfo'] = [
      'Current Step: ' + props.vmTrace[vmTraceIndex].steps,
      'Adding Memory: ' + (props.vmTrace[vmTraceIndex].memexpand ? props.vmTrace[vmTraceIndex].memexpand : ''),
      'Step Cost: ' + props.vmTrace[vmTraceIndex].gascost,
      'Remaining Gas: ' + props.vmTrace[vmTraceIndex].gas
    ]
    this.refs.slider.setValue(vmTraceIndex)
    this.setState(stateChanges)
  },

  shouldUpdateStateProperty: function (vmTraceName, nextIndex, previousIndex, vmTrace) {
    var propIndex = -1
    if (previousIndex + 1 === nextIndex) {
      propIndex = nextIndex
    } else {
      propIndex = this.retrieveLastSeenProperty(nextIndex, vmTraceName, vmTrace)
    }

    if (propIndex > -1 && vmTrace[propIndex][vmTraceName] !== undefined) {
      return propIndex
    } else {
      return -1
    }
  },

  retrieveLastSeenProperty: function (currentIndex, propertyName, vmTrace) {
    var index = currentIndex
    while (index > 0) {
      if (vmTrace[index][propertyName]) {
        break
      }
      index--
    }
    return index
  },

  stepIntoBack: function () {
    this.moveSelection(-1)
  },

  stepIntoForward: function () {
    this.moveSelection(1)
  },

  stepOverBack: function () {
    if (this.isReturnInstruction(this.state.currentSelected - 1)) {
      this.stepOutBack()
    } else {
      this.moveSelection(-1)
    }
  },

  stepOverForward: function () {
    if (this.isCallInstruction(this.state.currentSelected)) {
      this.stepOutForward()
    } else {
      this.moveSelection(1)
    }
  },

  isCallInstruction: function (index) {
    var state = this.props.vmTrace[index]
    return state.instname === 'CALL' || state.instname === 'CALLCODE' || state.instname === 'CREATE' || state.instname === 'DELEGATECALL'
  },

  isReturnInstruction: function (index) {
    var state = this.props.vmTrace[index]
    return state.instname === 'RETURN'
  },

  stepOutBack: function () {
    var i = this.state.currentSelected - 1
    var depth = 0
    while (--i >= 0) {
      if (this.isCallInstruction(i)) {
        if (depth === 0) {
          break
        } else {
          depth--
        }
      } else if (this.isReturnInstruction(i)) {
        depth++
      }
    }
    this.selectState(i)
  },

  stepOutForward: function () {
    var i = this.state.currentSelected
    var depth = 0
    while (++i < this.props.vmTrace.length) {
      if (this.isReturnInstruction(i)) {
        if (depth === 0) {
          break
        } else {
          depth--
        }
      } else if (this.isCallInstruction(i)) {
        depth++
      }
    }
    this.selectState(i + 1)
  },

  moveSelection: function (incr) {
    this.selectState(this.state.currentSelected + incr)
  },

  selectState: function (index) {
    this.updateState(this.props, index)
  },

  formatMemory: function (mem, width) {
    var ret = []
    for (var k = 0; k < mem.length; k += (width * 2)) {
      var memory = mem.substr(k, width * 2)
      ret.push({
        address: this.context.web3.toHex(k),
        content: this.tryAsciiFormat(memory)
      })
    }
    return ret
  },

  tryAsciiFormat: function (memorySlot) {
    var ret = { ascii: '', raw: '' }
    for (var k = 0; k < memorySlot.length; k += 2) {
      var raw = memorySlot.substr(k, 2)
      var ascii = this.context.web3.toAscii(raw)
      if (ascii === String.fromCharCode(0)) {
        ret.ascii += '?'
      } else {
        ret.ascii += ascii
      }
      ret.raw += ' ' + raw
    }
    return ret
  }
})
