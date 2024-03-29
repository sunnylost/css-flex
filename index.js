let doc = document
let body = doc.body
let dummy = doc.createElement('x-dummy')
let rBlank = /\s/
let rNumber = /^\d+$/
let rWhitespace = /([\u0009\u0020\u000a\u000d])+/

const AUTO = 'auto'
const CONTENT = 'content'
const MIN_WIDTH = 'min-width'
const MAX_WIDTH = 'max-width'
const INITIAL = 'initial'
const NONE = 'none'
const DEFAULT_FLEX_ITEM_ATTR = {
    grow: 0,
    shrink: 1,
    basis: AUTO,
    order: 0,
    'align-self': AUTO
}

function itemOuterWidth(item) {
    let el = item.el
    let innerWidth = itemInnerWidth(item)

    return innerWidth + realNumericValue(el, 'margin-left') + realNumericValue(el, 'margin-right')
}

function isValidBasisValue(val) {
    return isNumber(val) || val === INITIAL || val === AUTO || val === NONE
}

function isNumber(n) {
    return rNumber.test(n)
}

function defaultValueHelper(val, defaultVal) {
    return typeof val === 'undefined' ? defaultVal : val
}

// collection to array
function c2a(c) {
    return Array.prototype.slice.call(c, 0)
}

function cssValue(el, attr) {
    return el.style[attr]
}

function realValue(el, attr) {
    return window.getComputedStyle(el)[attr]
}

function realNumericValue(el, attr) {
    return parseFloat(realValue(el, attr)) || 0
}

function itemInnerWidth(item) {
    let el = item.el
    return (
        (item.width || item.baseSize || 0) +
        realNumericValue(el, 'padding-left') +
        realNumericValue(el, 'padding-right') +
        realNumericValue(el, 'border-left-width') +
        realNumericValue(el, 'border-right-width')
    )
}

function createAnonymousItem(node) {
    let item = document.createElement('x-flex-item')
    item.innerHTML = node.textContent
    node.parentNode.replaceChild(item, node)
    return item
}

function init() {
    body.appendChild(dummy)
    dummy.style.cssText = 'display:inline;visibility:hidden;'
}

function parseFlexAttrs(attrs) {
    let flexAttr = {}

    flexAttr.display = attrs.display || 'flex'

    if (attrs['flex-flow']) {
        let flexFlow = attrs['flex-flow']
        let arr = flexFlow.split(rBlank)

        if (arr.length === 1) {
            flexAttr.direction = arr[0]
            flexAttr.wrap = 'nowrap'
        } else if (arr.length === 2) {
            flexAttr.direction = arr[0]
            flexAttr.wrap = arr[1]
        }
    } else {
        flexAttr.direction = attrs['flex-direction'] || 'row'
        flexAttr.wrap = attrs['flex-wrap'] || 'nowrap'
    }

    flexAttr['justify-content'] = attrs['justify-content'] || 'flex-start'
    flexAttr['align-items'] = attrs['align-items'] || 'stretch'
    flexAttr['align-content'] = attrs['align-content'] || 'stretch' //multi-line

    return flexAttr
}

function parseFlexItemAttrs(attrs) {
    let flexItemAttrs = {}

    attrs = Object.assign(
        {
            all: {
                ...DEFAULT_FLEX_ITEM_ATTR
            }
        },
        attrs
    )

    Object.keys(attrs).forEach((key) => {
        if (isNumber(key)) {
            flexItemAttrs[parseInt(key) - 1] = parseItemAttr(attrs[key])
        } else {
            flexItemAttrs[key] = parseItemAttr(attrs[key])
        }
    })

    return flexItemAttrs
}

function parseItemAttr(attr) {
    let flexItemAttr = {
        ...DEFAULT_FLEX_ITEM_ATTR
    }
    let flex = attr.flex

    if (!flex) {
        flex = INITIAL
    }

    switch (flex) {
        case INITIAL:
            flex = '0 1 auto'
            break
        case AUTO:
            flex = '1 1 auto'
            break
        case NONE:
            flex = '0 0 auto'
            break
    }

    let flexParts = flex.split(rBlank)
    let firstVal = flexParts[0]
    let secondVal = flexParts[1]

    //don't consider decimal
    switch (flexParts.length) {
        case 0:
            flex = '0 1 auto'
            flexParts = flex.split(rBlank)
            break

        case 1:
            if (rNumber.test(firstVal)) {
                flex = firstVal + ' 1 0'
                flexParts.push('1')
                flexParts.push('0')
            } else {
                if (isValidBasisValue(firstVal)) {
                    throw new Error(`Invalid "flex" value: ${flex}`)
                } else {
                    flex = '1 1 ' + firstVal
                    flexParts.unshift('1')
                    flexParts.unshift('1')
                }
            }
            break

        case 2:
            if (isNumber(firstVal) && isNumber(secondVal)) {
                flex += ' 0'
                flexParts.push('0')
            } else if (isNumber(firstVal) && isValidBasisValue(secondVal)) {
                flex = `${firstVal} 1 ${secondVal}`
                flexParts.splice(1, 0, '1')
            } else {
                throw new Error(`Invalid "flex" value: ${flex}`)
            }

            break

        default:
            break
    }

    flexItemAttr.flex = flex
    flexItemAttr.grow = +defaultValueHelper(flexParts[0], 0)
    flexItemAttr.shrink = +defaultValueHelper(flexParts[1], 1)
    flexItemAttr.basis = defaultValueHelper(flexParts[2], AUTO)
    attr.order && (flexItemAttr.order = attr.order)
    attr['align-self'] && (flexItemAttr['align-self'] = attr['align-self'])

    Object.keys(attr).forEach((key) => {
        if (!flexItemAttr[key]) {
            flexItemAttr[key] = attr[key]
        }
    })

    return flexItemAttr
}

//https://drafts.csswg.org/css-flexbox/#line-sizing
function determineLineSize(flexContainer) {
    //https://drafts.csswg.org/css-flexbox/#algo-available
    let { items } = flexContainer

    items.forEach((item) => {
        let basis = item.attrs.basis
        let el = item.el

        if (basis) {
            if (basis === CONTENT) {
                if (!el.children.length) {
                    dummy.innerHTML = el.innerHTML
                    //TODO:not accurate
                    dummy.style.font = realValue(el, 'font')
                    let rect = dummy.getBoundingClientRect()
                    item.baseSize = rect.width
                }
            } else {
                item.baseSize = parseInt(basis)
            }
        }
        item.outerBaseSize = itemOuterWidth(item)
    })
}

function determineMainSize(flexContainer) {
    flexContainer.items.sort((a, b) => a.attrs.order - b.attrs.order)

    if (flexContainer.isSingleLine) {
        flexContainer.lines = [flexContainer.items]
    } else {
        let line = []
        let items = [...flexContainer.items]
        let width = flexContainer.width
        let reduceVal = 0
        let lines = (flexContainer.lines = [line])

        while (items.length) {
            let item = items.shift()
            reduceVal += item.outerBaseSize

            if (reduceVal > width) {
                line = [item]
                reduceVal = item.outerBaseSize
                lines.push(line)
            } else {
                line.push(item)
            }
        }
    }

    if (flexContainer.isLineReverse) {
        flexContainer.lines = flexContainer.lines.reverse()
    }

    flexContainer.lines.forEach(resolveFlexibleLengths, flexContainer)
}

function determineCrossSize(flexContainer) {
    if (flexContainer.isSingleLine && flexContainer.flexAttrs.height) {
        //TODO: computed height
        let height = parseFloat(flexContainer.flexAttrs.height)

        if (height) {
            flexContainer.height = height
        }
    } else {
        flexContainer.lineHeights = []
        flexContainer.lines.forEach((line) => {
            let heights = line.map((item) => {
                let el = item.el
                return (
                    realNumericValue(el, 'height') +
                    realNumericValue(el, 'padding-top') +
                    realNumericValue(el, 'padding-bottom') +
                    realNumericValue(el, 'border-top-width') +
                    realNumericValue(el, 'border-bottom-width') +
                    realNumericValue(el, 'margin-top') +
                    realNumericValue(el, 'margin-bottom')
                )
            })

            flexContainer.lineHeights.push(Math.max.apply(null, heights))
        })
    }
}

function computeFreeSpace(item, initWidth) {
    return item.reduce((accumulator, item) => {
        if (item.isFrozen) {
            return accumulator - item.width
        }

        //TODO: https://drafts.csswg.org/css-flexbox/#algo-main-item
        if (isNumber(item.baseSize)) {
            return accumulator - item.baseSize
        } else {
            return accumulator - itemInnerWidth(item)
        }
    }, initWidth)
}

//https://drafts.csswg.org/css-flexbox/#resolve-flexible-lengths
function resolveFlexibleLengths(line) {
    let allSize = line.reduce((accumulator, item) => {
        let attrs = item.attrs

        //size inflexible
        if (attrs.grow === 0 && attrs.shrink === 0) {
            item.isFrozen = true
            item.width = item.baseSize
        }
        return accumulator + item.baseSize
    }, 0)
    let containerWidth = this.width

    //1. Determine the used flex factor
    let isUsingGrowFactor = allSize < this.width
    let factorKey = isUsingGrowFactor ? 'grow' : 'shrink'
    let unfrozenItems = line.filter((item) => !item.isFrozen)
    let unfrozenItemsLength = unfrozenItems.length
    let initFreeSpace = 0
    let remainingFreeSpace = 0
    let isComputing = true

    initFreeSpace = computeFreeSpace(line, containerWidth)

    //Loop
    while (isComputing) {
        remainingFreeSpace = computeFreeSpace(line, containerWidth)

        let factorSum

        factorSum = unfrozenItems.reduce((accumulator, item) => {
            return accumulator + item.attrs[factorKey]
        }, 0)

        //b. Calculate the remaining free space
        if (factorSum < 1) {
            let tmp = initFreeSpace * factorSum

            if (tmp < remainingFreeSpace) {
                remainingFreeSpace = tmp
            }
        }

        unfrozenItems.forEach((item) => {
            let factor = item.attrs[factorKey]
            let ratio

            if (!factor) {
                ratio = 0
            } else {
                ratio = factor / factorSum
            }

            let mainSize

            if (remainingFreeSpace) {
                if (isUsingGrowFactor) {
                    mainSize = item.baseSize + remainingFreeSpace * ratio
                } else {
                    mainSize = item.baseSize - Math.abs(remainingFreeSpace) * ratio
                }
            } else {
                mainSize = item.baseSize
            }

            //FIXME: min/max violation
            let hasMinViolation = false
            let hasMaxViolation = false

            if (item.attrs[MAX_WIDTH] < item.width) {
                hasMaxViolation = true
                mainSize = item.attrs[MAX_WIDTH]
            } else if (item.attrs[MIN_WIDTH] > item.width) {
                hasMinViolation = true
                mainSize = item.attrs[MIN_WIDTH]
            }

            item.width = mainSize

            if (!hasMaxViolation && !hasMinViolation) {
                item.isFrozen = true
                unfrozenItemsLength--
            }

            item.el.style.cssText = `display:inline-block;width:${item.width}px;`
        })

        isComputing = !!unfrozenItemsLength
    }
}

function mainAxisAlignment(flexContainer) {
    flexContainer.el.style.position = 'relative'

    let preLineHeights = 0

    flexContainer.lines.forEach((line, i) => {
        mainAxisAlignmentFn(flexContainer, line, preLineHeights)
        preLineHeights += flexContainer.lineHeights[i]
    })
}

// TODO
function mainAxisAlignmentFn(flexContainer, line, preLineHeights, justifyContentProperty) {
    let firstItem
    let lastItem
    let lefOffset
    let stylePrefix = `position:absolute;top:${preLineHeights}px;`

    if (!line.length) return

    switch (justifyContentProperty || flexContainer.flexAttrs['justify-content']) {
        case 'flex-start':
            line.reduce((accumulator, item) => {
                let el = item.el
                el.style.cssText += `${stylePrefix}left:${accumulator}px;`

                return accumulator + itemOuterWidth(item)
            }, 0)
            break

        case 'flex-end':
            line.reduceRight((accumulator, item) => {
                let el = item.el
                el.style.cssText += `${stylePrefix}right:${accumulator}px;`

                return accumulator + itemOuterWidth(item)
            }, 0)
            break

        case 'center': {
            let widthSum = line.reduce((accumulator, item) => {
                return accumulator + itemOuterWidth(item)
            }, 0)

            lefOffset = (flexContainer.width - widthSum) / 2

            line.reduce((accumulator, item) => {
                let el = item.el
                el.style.cssText += `${stylePrefix}left:${accumulator}px;`

                return accumulator + itemOuterWidth(item)
            }, lefOffset)
            break
        }

        case 'space-between':
            if (line.length === 1) {
                return mainAxisAlignmentFn(flexContainer, line, preLineHeights, 'flex-start')
            }

            firstItem = line[0]
            lastItem = line[line.length - 1]

            firstItem.el.style.cssText += stylePrefix + 'left:0px;'
            lastItem.el.style.cssText += stylePrefix + 'right:0px;'

            if (line.length > 2) {
                let widthSum = line.reduce((accumulator, item) => {
                    return accumulator + itemInnerWidth(item)
                }, 0)

                let offset = (flexContainer.width - widthSum) / (line.length - 1)

                line.reduce((accumulator, item, i) => {
                    if (i !== 0 && i !== line.length - 1) {
                        let el = item.el
                        el.style.cssText += `${stylePrefix}left:${accumulator}px;`
                    }

                    return accumulator + itemInnerWidth(item) + offset
                }, 0)
            }

            break

        case 'space-around':
            if (line.length === 1) {
                return mainAxisAlignmentFn(flexContainer, line, preLineHeights, 'center')
            }

            let widthSum = line.reduce((accumulator, item) => {
                return accumulator + itemInnerWidth(item)
            }, 0)

            //first/last item has only half offset from container's edge.
            let offset = (flexContainer.width - widthSum) / line.length

            line.reduce((accumulator, item) => {
                let el = item.el
                el.style.cssText += `${stylePrefix}left:${accumulator}px;`

                return accumulator + itemInnerWidth(item) + offset
            }, offset / 2)
            break

        default:
        //do nothing
    }
}

/**
 * text nodes should be wrapped in an anonymous block box
 * @param childNodes
 * @returns {*}
 */
function handleFlexContainerChildren(childNodes) {
    return c2a(childNodes)
        .map((el, index) => {
            return {
                index,
                el
            }
        })
        .filter((item) => {
            switch (item.el.nodeType) {
                case 1:
                    return true

                case 3:
                    // has content
                    if (item.el.textContent.replace(rWhitespace, '').length) {
                        // create anonymous flex item
                        item.el = createAnonymousItem(item.el)
                        return true
                    } else {
                        return false
                    }

                default:
                    return false
            }
        })
}

function layout(el, flexAttrs, flexItemsAttrs) {
    let flexContainer = {
        el,
        items: handleFlexContainerChildren(el.childNodes),
        flexAttrs,
        flexItemsAttrs
    }

    //set item size
    let items = []
    for (let i = 0; i < flexContainer.items.length; i++) {
        let item = flexContainer.items[i]
        let el = item.el
        let display = realValue(el, 'display')
        let width

        if (display === NONE) {
            continue
        }

        item.attrs = flexItemsAttrs[i] || flexItemsAttrs.all
        width = parseFloat(item.attrs.width || flexItemsAttrs.all.width)

        if (!width) {
            width = cssValue(el, 'width')
        }

        if (width) {
            item.attrs.basis = width
        } else if ((!width || width === AUTO) && item.attrs.basis === AUTO) {
            item.attrs.basis = CONTENT
        }
        item.isInflexible = item.attrs.grow === 0 && item.attrs.shrink === 0
        //fix item's min/max width
        items.push(item)
    }

    flexContainer.items = items
    //single line
    flexContainer.isSingleLine = flexAttrs.wrap === 'nowrap'
    flexContainer.isLineReverse = flexAttrs.wrap === 'wrap-reverse'
    flexContainer.width = parseFloat(realValue(flexContainer.el, 'width')) || 0
    determineLineSize(flexContainer)
    determineMainSize(flexContainer)
    determineCrossSize(flexContainer)
    mainAxisAlignment(flexContainer)
}

function watchDimensionChange(rootEl, flexAttrs, itemAttrs) {
    let defaultWidth = rootEl.offsetWidth
    let defaultHeight = rootEl.offsetHeight
    let resizeTimeoutId

    function isDimensionChange() {
        return defaultWidth !== rootEl.offsetWidth || defaultHeight !== rootEl.offsetHeight
    }

    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeoutId)
        resizeTimeoutId = setTimeout(() => {
            isDimensionChange() && layout(rootEl, flexAttrs, itemAttrs)
        }, 20)
    })
}

init()

window.Flex = {
    apply: (containerEl, attrs, childrenAttrs) => {
        let rootEl = doc.querySelector(containerEl)

        if (!rootEl || !rootEl.childNodes || !rootEl.childNodes.length) {
            return
        }

        let flexAttrs = parseFlexAttrs(attrs || {})
        let itemAttrs = parseFlexItemAttrs(childrenAttrs || {})
        watchDimensionChange(rootEl, flexAttrs, itemAttrs)
        layout(rootEl, flexAttrs, itemAttrs)
    }
}
