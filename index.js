;(function (global) {
    let doc = document
    let body = doc.body
    let dummy = doc.createElement('x-dummy')
    let rblank = /\s/
    let rnumber = /^\d+$/
    let rwhitespace = /([\u0009\u0020\u000a\u000d])+/

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

    function isNumber(n) {
        return rnumber.test(n)
    }

    function defaultValueHelper(val, defaultVal) {
        return typeof val === 'undefined' ? defaultVal : val
    }

    //collection to array
    function c2a(c) {
        return Array.prototype.slice.call(c, 0)
    }

    function cssValue(el, attr) {
        return el.style[attr]
    }

    function realValue(el, attr) {
        return global.getComputedStyle(el)[attr]
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
            let arr = flexFlow.split(rblank)

            if (arr.length === 1) {
                flexAttr.direction = arr[0]
                flexAttr.wrap = 'nowrap'
            } else if (arr.length === 2) {
                flexAttr.direction = arr[0]
                flexAttr.wrap = arr[1]
            }
        } else {
            flexAttr.direction = attrs['flex-direction'] || 'row'
            flexAttr.wrap = attrs['flext-wrap'] || 'nowrap'
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
            default:
                if (rnumber.test(flex)) {
                    flex += ' 1 0'
                }
        }

        let flexParts = flex.split(rblank)

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
        })
    }

    function determineMainSize(flexContainer) {
        flexContainer.items.sort((a, b) => a.attrs.order - b.attrs.order)

        if (flexContainer.isSingleLine) {
            flexContainer.lines = [flexContainer.items]
        } else {
            let line = []
            let items = flexContainer.items.concat()
            let width = flexContainer.width
            let reduceVal = 0
            let lines = (flexContainer.lines = [line])

            while (items.length) {
                let item = items.shift()
                reduceVal += item.baseSize

                if (reduceVal > width) {
                    line = [item]
                    reduceVal = item.baseSize
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

            return accumulator - itemInnerWidth(item)
        }, initWidth)
    }

    //https://drafts.csswg.org/css-flexbox/#resolve-flexible-lengths
    function resolveFlexibleLengths(line) {
        let allSize = line.reduce((accumulator, item) => {
                return accumulator + item.baseSize
            }, 0),
            containerWidth = this.width

        //1. Determine the used flex factor
        let isUsingGrowFactor = allSize < this.width,
            unfrozenItems = line,
            unfrozenItemsLength = unfrozenItems.length,
            initFreeSpace = 0,
            remainingFreeSpace = 0,
            isComputing = true
        //TODO: size inflexible

        initFreeSpace = computeFreeSpace(line, containerWidth)

        //Loop
        while (isComputing) {
            remainingFreeSpace = computeFreeSpace(line, containerWidth)

            let factorSum

            if (isUsingGrowFactor) {
                factorSum = unfrozenItems.reduce((accumulator, item) => {
                    return accumulator + item.attrs.grow
                }, 0)
            } else {
                factorSum = unfrozenItems.reduce((accumulator, item) => {
                    return accumulator + item.attrs.shrink * item.baseSize
                }, 0)
            }

            unfrozenItems.forEach((item) => {
                let factor = isUsingGrowFactor ? item.attrs.grow : item.attrs.shrink * item.baseSize

                //b. Calculate the remaining free space
                if (factorSum < 1) {
                    let magnitude = initFreeSpace * factorSum

                    if (magnitude < remainingFreeSpace) {
                        remainingFreeSpace = magnitude
                    }
                }

                let ratio

                if (!factor) {
                    ratio = 0
                } else {
                    ratio = factor / factorSum
                }

                if (isUsingGrowFactor) {
                    item.width = item.baseSize + remainingFreeSpace * ratio
                } else {
                    item.width = item.baseSize - Math.abs(remainingFreeSpace) * ratio
                }

                let hasMinViolation = false,
                    hasMaxViolation = false

                if (item.attrs[MAX_WIDTH] < item.width) {
                    hasMaxViolation = true
                    item.width = item.attrs[MAX_WIDTH]
                } else if (item.attrs[MIN_WIDTH] > item.width) {
                    hasMinViolation = true
                    item.width = item.attrs[MIN_WIDTH]
                }

                //FIXME: min/max violation
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
            let firstItem,
                lastItem,
                lefOffset,
                stylePrefix = `position:absolute;top:${preLineHeights}px;`

            if (!line.length) return

            switch (flexContainer.flexAttrs['justify-content']) {
                case 'flex-start':
                    line.reduce((accumulator, item) => {
                        let el = item.el
                        el.style.cssText += `${stylePrefix}left:${accumulator}px;`

                        return accumulator + itemInnerWidth(item)
                    }, 0)
                    break

                case 'flex-end':
                    line.reduceRight((accumulator, item) => {
                        let el = item.el
                        el.style.cssText += `${stylePrefix}right:${accumulator}px;`

                        return accumulator + itemInnerWidth(item)
                    }, 0)
                    break

                case 'center': {
                    let widthSum = line.reduce((accumulator, item) => {
                        return accumulator + itemInnerWidth(item)
                    }, 0)

                    lefOffset = (flexContainer.width - widthSum) / 2

                    line.reduce((accumulator, item) => {
                        let el = item.el
                        el.style.cssText += `${stylePrefix}left:${accumulator}px;`

                        return accumulator + itemInnerWidth(item)
                    }, lefOffset)
                    break
                }

                case 'space-between':
                    if (line.length == 1) {
                        flexContainer.flexAttrs['justify-content'] = 'flex-start'
                        return mainAxisAlignment(flexContainer)
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
                    if (line.length == 1) {
                        flexContainer.flexAttrs['justify-content'] = 'center'
                        return mainAxisAlignment(flexContainer)
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

            preLineHeights += flexContainer.lineHeights[i]
        })
    }

    function layout(el, flexAttrs, flexItemsAttrs) {
        let flexContainer = {
            el,
            items: c2a(el.childNodes)
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
                            //has content
                            if (item.el.textContent.replace(rwhitespace, '').length) {
                                //create anonymous flex item
                                item.el = createAnonymousItem(item.el)
                                return true
                            } else {
                                return false
                            }

                        default:
                            return false
                    }
                }),
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

        //handle order, not write in spec.
        // items.sort((a, b) => {
        //     return a.attrs.order - b.attrs.order
        // })

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

    global.Flex = {
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
})(window)
