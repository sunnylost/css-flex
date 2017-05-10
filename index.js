(function( global ) {
    let doc     = document,
        body    = doc.body,
        dummy   = doc.createElement( 'x-dummy' ),

        rblank  = /\s/,
        rnumber = /^\d+$/

    const AUTO      = 'auto',
          CONTENT   = 'content',
          MIN_WIDTH = 'min-width',
          MAX_WIDTH = 'max-width'

    function defaultValueHelper( val, defaultVal ) {
        return typeof val === 'undefined' ? defaultVal : val
    }

    //collection to array
    function c2a( c ) {
        return Array.prototype.slice.call( c, 0 )
    }

    function cssValue( el, attr ) {
        return el.style[ attr ]
    }

    function realValue( el, attr ) {
        return global.getComputedStyle( el )[ attr ]
    }

    function itemInnerWidth( item ) {
        let el = item.el
        return ( item.width || item.baseSize || 0 )
            + ( parseFloat( realValue( el, 'padding-left' ) ) || 0 )
            + ( parseFloat( realValue( el, 'padding-right' ) ) || 0 )
            + ( parseFloat( realValue( el, 'border-left-width' ) ) || 0 )
            + ( parseFloat( realValue( el, 'border-right-width' ) ) || 0 )
    }

    function init() {
        body.appendChild( dummy )
        dummy.style.cssText = 'display:inline;visibility:hidden;'
    }

    function parseFlexAttrs( attrs ) {
        let flexAttr = {}

        flexAttr.display = attrs.display || 'flex'

        if ( attrs[ 'flex-flow' ] ) {
            let flexFlow = attrs[ 'flex-flow' ],
                arr      = flexFlow.split( rblank )

            if ( arr.length == 1 ) {
                flexAttr.direction = arr[ 0 ]
                flexAttr.wrap      = 'nowrap'
            } else if ( arr.length == 2 ) {
                flexAttr.direction = arr[ 0 ]
                flexAttr.wrap      = arr[ 1 ]
            }
        } else {
            flexAttr.direction = attrs[ 'flex-direction' ] || 'row'
            flexAttr.wrap      = attrs[ 'flext-wrap' ] || 'nowrap'
        }

        flexAttr[ 'justify-content' ] = attrs[ 'justify-content' ] || 'flex-start'
        flexAttr[ 'align-items' ]     = attrs[ 'align-items' ] || 'stretch'
        flexAttr[ 'align-content' ]   = attrs[ 'align-content' ] || 'stretch' //multi-line

        return flexAttr
    }

    function parseFlexItemAttrs( attrs ) {
        let flexItemAttrs = {}

        if ( attrs.all ) { //apply to all flex items
            flexItemAttrs.all = parseItemAttr( attrs.all )

            for ( let key in attrs ) {
                flexItemAttrs[ key ] = parseItemAttr( attrs[ key ] )
            }
        } else {
            for ( let key in attrs ) {
                flexItemAttrs[ key ] = parseItemAttr( attrs[ key ] )
            }

            flexItemAttrs.all = {
                grow        : 0,
                shrink      : 1,
                basis       : AUTO,
                order       : 0,
                'align-self': AUTO
            }
        }

        return flexItemAttrs
    }

    function parseItemAttr( attr ) {
        let flexItemAttr = {
            grow        : 0,
            shrink      : 1,
            basis       : AUTO,
            order       : 0,
            'align-self': AUTO
        }

        if ( !attr.flex ) {
            attr.flex = 'initial'
        }

        switch ( attr.flex ) {
        case 'initial':
            attr.flex = '0 1 auto'
            break
        case AUTO:
            attr.flex = '1 1 auto'
            break
        case 'none':
            attr.flex = '0 0 auto'
            break
        default:
            if ( rnumber.test( attr.flex ) ) {
                attr.flex += ' 1 0'
            }
        }

        let flexParts = attr.flex.split( rblank )

        flexItemAttr.grow   = +defaultValueHelper( flexParts[ 0 ], 0 )
        flexItemAttr.shrink = +defaultValueHelper( flexParts[ 1 ], 1 )
        flexItemAttr.basis  = defaultValueHelper( flexParts[ 2 ], AUTO )
        attr.order && ( flexItemAttr.order = attr.order )
        attr[ 'align-self' ] && ( flexItemAttr[ 'align-self' ] = attr[ 'align-self' ] )

        return flexItemAttr
    }

    //https://drafts.csswg.org/css-flexbox/#line-sizing
    function determineLineSize( flexContainer ) {
        //https://drafts.csswg.org/css-flexbox/#algo-available
        let { items } = flexContainer

        items.forEach( ( item ) => {
            let basis = item.attrs.basis,
                el    = item.el

            if ( basis ) {
                if ( basis === CONTENT ) {
                    if ( !el.children.length ) {
                        dummy.innerHTML  = el.innerHTML
                        dummy.style.font = realValue( el, 'font' )
                        let rect         = dummy.getBoundingClientRect()
                        item.baseSize    = rect.width
                    }
                } else {
                    item.baseSize = parseInt( basis )
                }
            }
        } )
    }

    function determineMainSize( flexContainer ) {
        if ( flexContainer.isSingleLine ) {
            flexContainer.lines = [ flexContainer.items ]
        } else {
            let line      = [],
                items     = flexContainer.items.concat(),
                width     = flexContainer.width,
                reduceVal = 0,
                lines     = flexContainer.lines = [ line ]

            while ( items.length ) {
                let item = items.shift()
                reduceVal += item.baseSize

                if ( reduceVal > width ) {
                    line      = [ item ]
                    reduceVal = item.baseSize
                    lines.push( line )
                } else {
                    line.push( item )
                }
            }
        }

        flexContainer.lines.forEach( resolveFlexibleLengths, flexContainer )
    }

    function computeFreeSpace( item, initWidth ) {
        return item.reduce( ( accumulator, item ) => {
            if ( item.isFrozen ) {
                return accumulator - item.width
            }

            return accumulator - itemInnerWidth( item )
        }, initWidth )
    }

    //https://drafts.csswg.org/css-flexbox/#resolve-flexible-lengths
    function resolveFlexibleLengths( line ) {
        //handle order, not write in spec.
        line.sort( ( a, b ) => {
            return a.attrs.order - b.attrs.order
        } )

        let allSize        = line.reduce( ( accumulator, item ) => {
                return accumulator + item.baseSize
            }, 0 ),
            containerWidth = this.width

        //1. Determine the used flex factor
        let isUsingGrowFactor   = allSize < this.width,
            unfrozenItems       = line,
            unfrozenItemsLength = unfrozenItems.length,
            initFreeSpace       = 0,
            remainingFreeSpace  = 0,
            isComputing         = true
        //TODO: size inflexible

        initFreeSpace = computeFreeSpace( line, containerWidth )

        //Loop
        while ( isComputing ) {
            remainingFreeSpace = computeFreeSpace( line, containerWidth )

            let factorSum

            if ( isUsingGrowFactor ) {
                factorSum = unfrozenItems.reduce( ( accumulator, item ) => {
                    return accumulator + item.attrs.grow
                }, 0 )
            } else {
                factorSum = unfrozenItems.reduce( ( accumulator, item ) => {
                    return accumulator + item.attrs.shrink * item.baseSize
                }, 0 )
            }

            unfrozenItems.forEach( ( item ) => {
                let factor = isUsingGrowFactor ? item.attrs.grow : ( item.attrs.shrink * item.baseSize )

                //b. Calculate the remaining free space
                if ( factorSum < 1 ) {
                    let magnitude = initFreeSpace * factorSum

                    if ( magnitude < remainingFreeSpace ) {
                        remainingFreeSpace = magnitude
                    }
                }

                let ratio

                if ( !factor ) {
                    ratio = 0
                } else {
                    ratio = factor / factorSum
                }

                if ( isUsingGrowFactor ) {
                    item.width = item.baseSize + remainingFreeSpace * ratio
                } else {
                    item.width = item.baseSize - Math.abs( remainingFreeSpace ) * ratio
                }

                let hasMinViolation = false,
                    hasMaxViolation = false

                if ( item.attrs[ MAX_WIDTH ] < item.width ) {
                    hasMaxViolation = true
                    item.width      = item.attrs[ MAX_WIDTH ]
                } else if ( item.attrs[ MIN_WIDTH ] > item.width ) {
                    hasMinViolation = true
                    item.width      = item.attrs[ MIN_WIDTH ]
                }

                //FIXME: min/max violation
                if ( !hasMaxViolation && !hasMinViolation ) {
                    item.isFrozen = true
                    unfrozenItemsLength--
                }

                item.el.style.cssText = `display:inline-block;width:${ item.width }px;`
            } )

            isComputing = !!unfrozenItemsLength
        }
    }

    function mainAxisAlignment( flexContainer ) {
        flexContainer.el.style.position = 'relative';

        flexContainer.lines.forEach( ( line ) => {
            let firstItem, lastItem

            if ( !line.length ) return

            switch ( flexContainer.flexAttrs[ 'justify-content' ] ) {
            case 'flex-start':
                line.reduce( ( accumulator, item ) => {
                    let el = item.el
                    el.style.cssText += `position:absolute;top:0;left:${ accumulator }px;`

                    return accumulator + itemInnerWidth( item )
                }, 0 )
                break

            case 'flex-end':
                line.reduceRight( ( accumulator, item ) => {
                    let el = item.el
                    el.style.cssText += `position:absolute;top:0;right:${ accumulator }px;`

                    return accumulator + itemInnerWidth( item )
                }, 0 )
                break

            case 'center':
                let widthSum = line.reduce( ( accumulator, item ) => {
                    return accumulator + itemInnerWidth( item )
                }, 0 )

                let lefOffset = ( flexContainer.width - widthSum ) / 2

                line.reduce( ( accumulator, item ) => {
                    let el = item.el
                    el.style.cssText += `position:absolute;top:0;left:${ accumulator }px;`

                    return accumulator + itemInnerWidth( item )
                }, lefOffset )
                break

            case 'space-between':
                if ( line.length == 1 ) {
                    flexContainer.flexAttrs[ 'justify-content' ] = 'flex-start'
                    return mainAxisAlignment( flexContainer )
                }

                firstItem = line[ 0 ]
                lastItem  = line[ line.length - 1 ]

                firstItem.el.style.cssText += 'position:absolute;top:0;left:0px;'
                lastItem.el.style.cssText += 'position:absolute;top:0;right:0px;'

                if ( line.length > 2 ) {
                    let widthSum = line.reduce( ( accumulator, item ) => {
                        return accumulator + itemInnerWidth( item )
                    }, 0 )

                    let offset = ( flexContainer.width - widthSum ) / ( line.length - 1 )

                    line.reduce( ( accumulator, item, i ) => {
                        if ( i !== 0 && i !== line.length - 1 ) {
                            let el = item.el
                            el.style.cssText += `position:absolute;top:0;left:${ accumulator }px;`
                        }

                        return accumulator + itemInnerWidth( item ) + offset
                    }, 0 )
                }

                break

            case 'space-around':
                if ( line.length == 1 ) {
                    flexContainer.flexAttrs[ 'justify-content' ] = 'center'
                    return mainAxisAlignment( flexContainer )
                }

                firstItem = line[ 0 ]
                lastItem  = line[ line.length - 1 ]

                firstItem.el.style.cssText += 'position:absolute;top:0;left:0px;'
                lastItem.el.style.cssText += 'position:absolute;top:0;right:0px;'

                if ( line.length > 2 ) {
                    let widthSum = line.reduce( ( accumulator, item ) => {
                        return accumulator + itemInnerWidth( item )
                    }, 0 )

                    //first/last item has only half offset from container's edge.
                    let offset = ( flexContainer.width - widthSum ) / line.length

                    line.reduce( ( accumulator, item, i ) => {
                        let el = item.el
                        el.style.cssText += `position:absolute;top:0;left:${ accumulator }px;`

                        return accumulator + itemInnerWidth( item ) + offset
                    }, offset / 2 )
                }
                break

            default:
                //do nothing
            }
        } )
    }

    function layout( el, flexAttrs, flexItemsAttrs ) {
        let flexContainer = {
            el,
            items: c2a( el.children ).map( ( el, index ) => {
                return {
                    index, el
                }
            } ),
            flexAttrs,
            flexItemsAttrs
        }

        //set item size
        flexContainer.items.forEach( ( item, i ) => {
            let width  = cssValue( item.el, 'width' )
            item.attrs = flexItemsAttrs[ i ] || flexItemsAttrs.all

            if ( (!width || width === AUTO) && item.attrs.basis === AUTO ) {
                item.attrs.basis = CONTENT
            }
            item.isInflexible = item.attrs.grow === 0 && item.attrs.shrink === 0
            //fix item's min/max width
        } )

        //single line
        flexContainer.isSingleLine = flexAttrs.wrap === 'nowrap'
        flexContainer.width        = parseFloat( realValue( flexContainer.el, 'width' ) ) || 0
        determineLineSize( flexContainer )
        determineMainSize( flexContainer )
        mainAxisAlignment( flexContainer )
    }

    init()

    global.Flex = {
        apply: ( containerEl, attrs, childrenAttrs ) => {
            layout( doc.querySelector( containerEl ), parseFlexAttrs( attrs ), parseFlexItemAttrs( childrenAttrs ) )
        }
    }
})( window )
