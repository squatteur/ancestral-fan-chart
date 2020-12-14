/*global
    window, console, Math, d3, jQuery
*/

/**
 * Webtrees module.
 *
 * Copyright (C) 2017  Rico Sonntag
 *
 * This program is free software; you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software Foundation,
 * Inc., 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301  USA
 */

/**
 * jQuery widget "rso.ancestralFanChart"
 */
(function ($) {
    'use strict';

    $.widget('rso.ancestralFanChart', {
        options: {
            // Default number of generations to display
            generations: 6,

            // Default background color of an arc
            defaultColor: '#eee',

            // Default font size, color and scaling
            fontSize: 13,
            fontColor: '#000',
            fontScale: 100,

            // Default degrees of the fan chart
            fanDegree: 210,

            startPi: -Math.PI,
            endPi: Math.PI,

            minHeight: 500,
            padding: 10,             // Padding around view box

            // Arc dimensions
            circlePadding: 0,        // Padding in pixel between each generation circle
            numberOfInnerCircles: 5, // Number of circles, large enough to print text along arc path
            centerCircleRadius: 85,  // Radius of the innermost circle
            innerArcHeight: 85,      // Height of each inner circle arc
            outerArcHeight: 115,     // Height of each outer circle arc

            colorArcWidth: 5,        // Width of the colored arc above each single person arc
            textPadding: 8,          // Left/Right padding of text (used with truncation)

            // Whether to hide empty segments of chart or not
            hideEmptySegments: false,

            // Whether to show color gradients or not
            showColorGradients: false,

            // Whether to show completed or not
            showCompleted: false,

            // Duration of update animation if clicked on a person
            updateDuration: 1250,

            x: null,

            updateUrl: '',
            individualUrl: ''
        },

        config: {
        },

        /**
         * Initialize the tool.
         *
         * @constructs ancestralFanChart
         */
        _create: function () {
            this.options.startPi = -(this.options.fanDegree / 360 * Math.PI);
            this.options.endPi   = (this.options.fanDegree / 360 * Math.PI);

            // Helper method to create a ongoing id
            this.options.id = (function (reset) {
                let i = 1;
                let r = reset || false;

                return function (r) {
                    if (r) {
                        i = 0;
                    }

                    return i++;
                }
            })();

            // Scale the angles linear across the circle
            this.options.x = d3.scaleLinear().range([this.options.startPi, this.options.endPi]);

            // Start bootstrapping
            this.initChart();
            this.initData(this.options.data);
            this.createArcElements();
            this.updateViewBox();
        },

        /**
         * Create an empty child node object.
         *
         * @param {number} generation Generation of the node
         *
         * @return {object}
         */
        createEmptyNode: function (generation, sex) {
            return {
                id: 0,
                xref: '',
                sex: sex,
                name: '',
                generation: generation,
                color: this.options.defaultColor,
                colors: [[], []]
            };
        },

        /**
         * Initialize the chart.
         *
         * @private
         */
        initChart: function () {
            var that = this;

            this.config.zoom = d3.zoom()
                .scaleExtent([0.5, 5.0])
                .on('zoom', $.proxy(this.doZoom, this));

            this.config.zoom.filter(function () {
                // Allow "wheel" event only while control key is pressed
                if (d3.event.type === 'wheel') {
                    if (that.config.zoomLevel && d3.event.ctrlKey) {
                        // Prevent zooming below lowest level
                        if ((that.config.zoomLevel <= 0.5) && (d3.event.deltaY > 0)) {
                            d3.event.preventDefault();
                            return false;
                        }

                        // Prevent zooming above highest level
                        if ((that.config.zoomLevel >= 5.0) && (d3.event.deltaY < 0)) {
                            d3.event.preventDefault();
                            return false;
                        }
                    }

                    return d3.event.ctrlKey;
                }

                // Allow "touchmove" event only with two fingers
                if (!d3.event.button && (d3.event.type === 'touchmove')) {
                    return d3.event.touches.length === 2;
                }

                return true;
            });

            // Parent container
            this.config.parent = d3
                .select('#fan_chart');

            // Add SVG element
            this.config.svg = this.config.parent
                .append('svg')
                .attr('version', '1.1')
                .attr('xmlns', 'http://www.w3.org/2000/svg')
                .attr('xmlns:xlink', 'http://www.w3.org/1999/xlink')
                .attr('width', '100%')
                .attr('height', '100%')
                .attr('text-rendering', 'geometricPrecision')
                .attr('text-anchor', 'middle')
                .on('contextmenu', function () {
                    d3.event.preventDefault();
                })
                .on('wheel', $.proxy(function () {
                    if (!d3.event.ctrlKey) {
                        that.showTooltipOverlay(this.options.labels.zoom, 300, function () {
                            that.hideTooltipOverlay(700, 800);
                        });
                    }
                }, this))
                .on('touchend', $.proxy(function () {
                    if (d3.event.touches.length < 2) {
                        that.hideTooltipOverlay(0, 800);
                    }
                }, this))
                .on('touchmove', $.proxy(function () {
                    if (d3.event.touches.length >= 2) {
                        // Hide tooltip on more than 2 fingers
                        that.hideTooltipOverlay();
                    } else {
                        // Show tooltip if less than 2 fingers are used
                        that.showTooltipOverlay(this.options.labels.move);
                    }
                }, this))
                .on('click', $.proxy(this.doStopPropagation, this), true);

            if (this.options.rtl) {
                this.config.svg.classed('rtl', true);
            }

            // Create the svg:defs element
            this.config.svgDefs = this.config.svg
                .append('defs');

            if (this.options.showCompleted) {
                // Create the svg:defs element
                this.config.svgDefs = this.config.svg
                    .append('completed');
            }

            // Add an overlay with tooltip
            this.config.overlay = this.config.parent
                .append('div')
                .attr('class', 'overlay')
                .style('opacity', 0);

            // Add rectangle element
            this.config.svg
                .append('rect')
                .attr('class', 'background')
                .attr('width', '100%')
                .attr('height', '100%');

            // Bind click event on reset button
            var $resetButton = $(this.config.parent.node())
                .siblings('form')
                .find('input[type=reset]');

            d3.select($resetButton.get(0))
                .on('click', $.proxy(this.doReset, this));

            // Add group
            this.config.visual = this.config.svg
                .append('g');

            this.config.visual
                .append('g')
                .attr('class', 'personGroup');

            this.config.svg.call(this.config.zoom);
        },

        /**
         * Stop any pending transition and hide overlay immediately.
         *
         * @param {string}  text     Text to display in overlay
         * @param {int}     duration Duration of transition in msec
         * @param {closure} callback Callback method to execute on end of transition
         *
         * @private
         */
        showTooltipOverlay: function (text, duration, callback) {
            duration = duration || 0;

            this.config.overlay
                .select('p')
                .remove();

            this.config.overlay
                .append('p')
                .attr('class', 'tooltip')
                .text(text);

            this.config.overlay
                .transition()
                .duration(duration)
                .style('opacity', 1)
                .on('end', function() {
                    if (callback) {
                        callback();
                    }
                });
        },

        /**
         * Stop any pending transition and hide overlay immediately.
         *
         * @param {int} delay    Delay in msec to wait before transition should start
         * @param {int} duration Duration of transition in msec
         *
         * @private
         */
        hideTooltipOverlay: function (delay, duration) {
            delay = delay || 0;
            duration = duration || 0;

            this.config.overlay
                .transition()
                .delay(delay)
                .duration(duration)
                .style('opacity', 0);
        },

        /**
         * Prevent default click and stop propagation.
         *
         * @private
         */
        doStopPropagation: function () {
            if (d3.event.defaultPrevented) {
                d3.event.stopPropagation();
            }
        },

        /**
         * Reset chart to initial zoom level and position.
         *
         * @private
         */
        doReset: function () {
            this.config.svg
                .transition()
                .duration(750)
                .call(this.config.zoom.transform, d3.zoomIdentity);
        },

        /**
         * Zoom chart.
         *
         * @private
         */
        doZoom: function () {
            // Abort any action if only one finger is used on "touchmove" events
            if (d3.event.sourceEvent
                && (d3.event.sourceEvent.type === 'touchmove')
                && (d3.event.sourceEvent.touches.length < 2)
            ) {
                return;
            }

            this.config.zoomLevel = d3.event.transform.k;

            this.config.visual.attr(
                'transform',
                d3.event.transform
            );
        },

        /**
         * Initialize the chart data.
         *
         * @param {object} data JSON encoded data
         *
         * @private
         */
        initData: function (data) {
            var that = this;

            // Construct root node
            var root = d3.hierarchy(
                data,
                function (d) {
                    // Fill up the missing children to the requested number of generations
                    if (!d.children && (d.generation < that.options.generations)) {
                        return [
                            that.createEmptyNode(d.generation + 1, 'M'),
                            that.createEmptyNode(d.generation + 1, 'F')
                        ];
                    }

                    // Add missing parent record if we got only one
                    if (d.children && (d.children.length < 2)) {
                        if (d.children[0].sex === 'M') {
                            // Append empty node if we got an father
                            d.children.push(that.createEmptyNode(d.generation + 1, 'F'));
                        } else {
                            // Else prepend empty node
                            d.children.unshift(that.createEmptyNode(d.generation + 1, 'M'));
                        }
                    }

                    return d.children;
                })
                // Calculate number of leaves
                .count();

            var partition = d3.partition();
            this.config.nodes = partition(root).descendants();

            // Create unique id for each element
            this.config.nodes.forEach(function (entry) {
                entry.data.id = that.options.id();
            });

            that.options.id(true);
        },

        /**
         * Update/Calculate the viewBox attribute of the SVG element.
         */
        updateViewBox: function () {
            // Get bounding boxes
            var svgBoundingBox    = this.config.visual.node().getBBox();
            var clientBoundingBox = this.config.parent.node().getBoundingClientRect();

            // View box should have at least the same width/height as the parent element
            var viewBoxWidth  = Math.max(clientBoundingBox.width, svgBoundingBox.width);
            var viewBoxHeight = Math.max(clientBoundingBox.height, svgBoundingBox.height, this.options.minHeight);

            // Calculate offset to center chart inside svg
            var offsetX = (viewBoxWidth - svgBoundingBox.width) / 2;
            var offsetY = (viewBoxHeight - svgBoundingBox.height) / 2;

            // Adjust view box dimensions by padding and offset
            var viewBoxLeft = Math.ceil(svgBoundingBox.x - offsetX - this.options.padding);
            var viewBoxTop  = Math.ceil(svgBoundingBox.y - offsetY - this.options.padding);

            // Final width/height of view box
            viewBoxWidth  = Math.ceil(viewBoxWidth + (this.options.padding * 2));
            viewBoxHeight = Math.ceil(viewBoxHeight + (this.options.padding * 2));

            // Set view box attribute
            this.config.svg
                .attr('viewBox', [
                    viewBoxLeft,
                    viewBoxTop,
                    viewBoxWidth,
                    viewBoxHeight
                ]);

            // Adjust rectangle position
            this.config.svg
                .select('rect')
                .attr('x', viewBoxLeft)
                .attr('y', viewBoxTop);
        },

        /**
         * Calculate the angle in radians.
         *
         * @param {number} value Value
         *
         * @returns {number}
         */
        calcAngle: function (value) {
            return Math.max(
                this.options.startPi,
                Math.min(this.options.endPi, this.options.x(value))
            );
        },

        /**
         * Get the start angle in radians.
         *
         * @param {object} d D3 data object
         *
         * @returns {number}
         */
        startAngle: function (d) {
            return this.calcAngle(d.x0);
        },

        /**
         * Get the end angle in radians.
         *
         * @param {object} d D3 data object
         *
         * @returns {number}
         */
        endAngle: function (d) {
            return this.calcAngle(d.x1);
        },

        /**
         * Get the inner radius depending on the depth of an element.
         *
         * @param {object} d D3 data object
         *
         * @returns {number}
         */
        innerRadius: function (d) {
            if (d.depth === 0) {
                return 0;
            }

            if (d.depth < this.options.numberOfInnerCircles) {
                return ((d.depth - 1) * (this.options.innerArcHeight + this.options.circlePadding))
                    + this.options.centerCircleRadius;
            }

            return ((this.options.numberOfInnerCircles - 1) * (this.options.innerArcHeight + this.options.circlePadding))
                + ((d.depth - this.options.numberOfInnerCircles) * (this.options.outerArcHeight + this.options.circlePadding))
                + this.options.centerCircleRadius;
        },

        /**
         * Get the outer radius depending on the depth of an element.
         *
         * @param {object} d D3 data object
         *
         * @returns {number}
         */
        outerRadius: function (d) {
            if (d.depth === 0) {
                return this.options.centerCircleRadius;
            }

            if (d.depth <  this.options.numberOfInnerCircles) {
                return ((d.depth - 1) * (this.options.innerArcHeight + this.options.circlePadding))
                    + this.options.innerArcHeight + this.options.centerCircleRadius;
            }

            return ((this.options.numberOfInnerCircles - 1) * (this.options.innerArcHeight + this.options.circlePadding))
                + ((d.depth - this.options.numberOfInnerCircles) * (this.options.outerArcHeight + this.options.circlePadding))
                + this.options.outerArcHeight + this.options.centerCircleRadius;
        },

        /**
         * Get the center radius.
         *
         * @param {object} d D3 data object
         *
         * @returns {number}
         */
        centerRadius: function (d) {
            return (this.innerRadius(d) + this.outerRadius(d)) / 2;
        },

        /**
         * Get an radius relative to the outer radius adjusted by the given
         * position in percent.
         *
         * @param {object} d        D3 data object
         * @param {number} position Percent offset (0 = inner radius, 100 = outer radius)
         *
         * @returns {number}
         */
        relativeRadius: function (d, position) {
            var outerRadius = this.outerRadius(d);
            return outerRadius - ((100 - position) * (outerRadius - this.innerRadius(d)) / 100);
        },

        /**
         * Get an radius relative to the outer radius adjusted by the given
         * position in percent.
         *
         * @param {object} d        D3 data object
         * @param {number} position Percent offset (0 = inner radius, 100 = outer radius)
         *
         * @returns {number}
         */
        arcLength: function (d, position) {
            return (this.endAngle(d) - this.startAngle(d)) * this.relativeRadius(d, position);
        },

        /**
         * Add title element to the person element containing the full name of the individual.
         *
         * @param {object} person Parent element used to append the title too
         * @param {object} d      D3 data object
         *
         * @return {void}
         */
        addTitleToPerson: function (person, d) {
            var that = this;
            person
                .insert('title', ':first-child')
                .text(function () {
                    // Return name or remove empty title element
                    if (that.options.showCompleted) {
                        return (d.data.xref !== '') ? d.data.name + ' ' + d.data.mediaborn + ' ' + d.data.mediamarr + ' ' + d.data.mediadied : this.remove();
                    } else {
                        return (d.data.xref !== '') ? d.data.name : this.remove();
                    }
                });
        },

        /**
         * Append arc element to the person element.
         *
         * @param {object} person Parent element used to append the arc too
         * @param {object} d      D3 data object
         *
         * @param {void}
         */
        addArcToPerson: function (person, d) {
            var that = this;

            // Arc generator
            var arcGen = d3.arc()
                .startAngle(function () {
                    return (d.depth === 0) ? 0 : that.startAngle(d);
                })
                .endAngle(function () {
                    return (d.depth === 0) ? (Math.PI * 2) : that.endAngle(d);
                })
                .innerRadius(that.innerRadius(d))
                .outerRadius(that.outerRadius(d));

            // Append arc
            var arcGroup = person
                .append('g')
                .attr('class', 'arc');

            var path = arcGroup
                .append('path')
                .attr('d', arcGen);

            // Hide arc initially if its new during chart update
            if (person.classed('new')) {
                path.style('opacity', 0);
            }
        },

        /**
         * Append labels (initial hidden).
         *
         * @param {object} parent Parent element used to append the label element too
         *
         * @return {object} Newly added label element
         */
        addLabelToPerson: function (parent) {
            return parent
                .append('g')
                .attr('class', 'label')
                .style('fill', this.options.fontColor);
        },

        /**
         * Add "text" element to given parent element.
         *
         * @param {object} parent Parent element used to append the "text" element
         *
         * @return {object} Newly added label element
         */
        appendTextToLabel: function (parent, d) {
            return parent
                .append('text')
                .attr('dominant-baseline', 'middle')
                .style('font-size', this.getFontSize(d));
        },

        /**
         * Append "textPath" element.
         *
         * @param {object} parent Parent element used to append the "textPath" element
         * @param {string} refId  Id of reference element
         *
         * @return {object} D3 textPath object
         */
        appendTextPath: function (parent, refId) {
            return parent.append('textPath')
                .attr('xlink:href', function () {
                    return '#' + refId;
                })
                .attr('startOffset', '25%');
        },

        /**
         * Append the arc paths to the label element.
         *
         * @param {object} label Label element used to append the arc path
         * @param {object} d     D3 data object
         *
         * @param {void}
         */
        addArcPathToLabel: function (label, d) {
            var that = this;

            if (this.isInnerLabel(d)) {
                // Inner labels
                let text     = this.appendTextToLabel(label, d);
                let timeSpan = this.getTimeSpan(d);
				let objectFind = that.getObjectFind(d);

                // Create a path for each line of text as mobile devices
                // won't display <tspan> elements in the right position
                let pathId1 = this.appendPathToLabel(label, 0, d);
                let pathId2 = this.appendPathToLabel(label, 1, d);

                if (d.data.processed && that.options.showCompleted) {
                    label = label
                    .style('fill', function (d) {
                        return 'rgb(151, 75, 162)';
                    });
                }

                this.appendTextPath(text, pathId1.attr('id'))

                    .text(this.getFirstNames(d))
                    .each(this.truncate(d, 0));

                this.appendTextPath(text, pathId2)
                    .text(this.getLastName(d))
                    .each(this.truncate(d, 1));

                if (d.data.alternativeName) {
                    let pathId3 = this.appendPathToLabel(label, 2, d);

                    this.appendTextPath(text, pathId3)
                        .attr('class', 'alternativeName')
                        .classed('rtl', d.data.isAltRtl)
                        .text(d.data.alternativeName)
                        .each(this.truncate(d, 2));
                }

                if (timeSpan) {
                    let pathId4 = this.appendPathToLabel(label, 3, d);

                    this.appendTextPath(text, pathId4)
                        .attr('class', 'date')
                        .text(timeSpan)
                        .each(this.truncate(d, 3));

                    if (that.options.showCompleted) {
                        let pathId5 = this.appendPathToLabel(label, 4, d);
                        this.appendTextPath(text, pathId5.attr('id'))
                        .attr('class', 'date')
                        .text(objectFind);
                    }
                }
            } else {
                // Outer labels
                let name     = d.data.name;
                let timeSpan = that.getTimeSpan(d);
                let objectFind = that.getObjectFind(d);

                // Return first name for inner circles
                if (d.depth < 7) {
                    name = that.getFirstNames(d);
                }
                if (d.data.processed && that.options.showCompleted) {
                    label = label
                    .style('fill', function (d) {
                        return 'rgb(151, 75, 162)';
                    });
                }
                // Create the text elements for first name, last name and
                // the birth/death dates
                that.appendOuterArcText(d, 0, label, name);

                // The outer most circles show the complete name and do not distinguish between
                // first name, last name and dates
                if (d.depth < 7) {
                    // Add last name
                    that.appendOuterArcText(d, 1, label, that.getLastName(d));

                    if ((d.depth < 5) && d.data.alternativeName) {
                        let textElement = that.appendOuterArcText(d, 2, label, d.data.alternativeName, 'alternativeName');

                        if (d.data.isAltRtl) {
                            textElement.classed('rtl', true);
                        }
                    }

                    // Add dates
                    if ((d.depth === 5) && timeSpan) {
                        if (that.options.showCompleted) {
                            that.appendOuterArcText(d, 3, label, objectFind + ' ' + timeSpan, 'date');
                        } else {
                            that.appendOuterArcText(d, 3, label, timeSpan, 'date');
                        }
                    }

                    if ((d.depth < 5) && timeSpan) { // en dessous du 5e niveau, on affiche sur deux lignes (plus joli) 
                        if (that.options.showCompleted) {
                            that.appendOuterArcText(d, 3, label, objectFind);
                        } 
                        that.appendOuterArcText(d, 3, label, timeSpan, 'date');
                    }
                }

                // Rotate outer labels in right position
                that.transformOuterText(label, d);
            }
        },

        addPersonData: function (person, d) {
            if (person.classed('new') && this.options.hideEmptySegments) {
                this.addArcToPerson(person, d);
            } else {
                if (!person.classed('new')
                    && !person.classed('update')
                    && !person.classed('remove')
                    && ((d.data.xref !== '') || !this.options.hideEmptySegments)
                ) {
                    this.addArcToPerson(person, d);
                }
            }

            if (d.data.xref !== '') {
                this.addTitleToPerson(person, d);

                // Append labels (initial hidden)
                var label = this.addLabelToPerson(person);

                this.addArcPathToLabel(label, d);
            }

            // Hovering
            person
                .on('mouseover', function () {
                    d3.select(this).classed('hover', true);
                })
                .on('mouseout', function () {
                    d3.select(this).classed('hover', false);
                });
        },

        /**
         * Create an gradient fill and return unique identifier.
         *
         * @param {object} d D3 data object
         *
         * @return {void}
         */
        addGradientColor: function (d) {
            var that = this;

            if (d.depth < 1) {
                return;
            }

            // Define initial gradient colors starting with second generation
            if (d.depth === 1) {
                let color1 = [64, 143, 222];
                let color2 = [161, 219, 117];

                if (d.data.sex === 'F') {
                    color1 = [218, 102, 13],
                    color2 = [235, 201, 33];
                }

                d.data.colors = [color1, color2];

            // Calculate subsequent gradient colors
            } else {
                var c = [
                    Math.ceil((d.parent.data.colors[0][0] + d.parent.data.colors[1][0]) / 2.0),
                    Math.ceil((d.parent.data.colors[0][1] + d.parent.data.colors[1][1]) / 2.0),
                    Math.ceil((d.parent.data.colors[0][2] + d.parent.data.colors[1][2]) / 2.0),
                ];

                if (d.data.sex === 'M') {
                    d.data.colors[0] = d.parent.data.colors[0];
                    d.data.colors[1] = c;
                }

                if (d.data.sex === 'F') {
                    d.data.colors[0] = c;
                    d.data.colors[1] = d.parent.data.colors[1];
                }
            }

            // Add a new radial gradient
            var newGrad = this.config.svgDefs
                .append('svg:linearGradient')
                .attr('id', function () {
                    return 'grad-' + d.data.id;
                });

            // Define start and stop colors of gradient
            newGrad.append('svg:stop')
                .attr('offset', '0%')
                .attr('stop-color', 'rgb(' + d.data.colors[0].join(',') + ')');

            newGrad.append('svg:stop')
                .attr('offset', '100%')
                .attr('stop-color', 'rgb(' + d.data.colors[1].join(',') + ')');
        },

        /**
         * Adds an color overlay for each arc.
         *
         * @return {object} Color group object
         */
        addColorGroup: function () {
            var that = this;

            // Arc generator
            var arcGen = d3.arc()
                .startAngle(function (d) {
                    return (d.depth === 0) ? 0 : that.startAngle(d);
                })
                .endAngle(function (d) {
                    return (d.depth === 0) ? (Math.PI * 2) : that.endAngle(d);
                })
                .innerRadius(function (d) {
                    return that.outerRadius(d) - that.options.colorArcWidth;
                })
                .outerRadius(function (d) {
                    return that.outerRadius(d) + 1;
                });

            var colorGroup = this.config.svg
                .select('g')
                .append('g')
                .attr('class', 'colorGroup')
                .style('opacity', 0);

            colorGroup
                .selectAll('g.colorGroup')
                .data(this.config.nodes)
                .enter()
                .filter(function (d) {
                    return (d.data.xref !== '');
                })
                .append('path')
                .attr('fill', function (d) {
                    if (that.options.showColorGradients) {
                        // Innermost circle (first generation) or undefined gender
                        if (!d.depth) {
                            return 'rgb(225, 225, 225)';
                        }

                        return 'url(#grad-' + d.data.id + ')';
                    }

                    return d.data.color;
                })
                .attr('d', arcGen);

            return colorGroup;
        },

        /**
         * Create the arc elements for each individual in the data list.
         *
         * @return {void}
         */
        createArcElements: function () {
            var that        = this;
            var personGroup = this.config.svg.select('g.personGroup');

            personGroup.selectAll('g.person')
                .data(this.config.nodes)
                .enter()
                .each(function (entry) {
                    var person = personGroup
                        .append('g')
                        .attr('class', 'person')
                        .attr('id', 'person-' + entry.data.id)
                        .on('click', null);

                    that.addPersonData(person, entry);

                    if (that.options.showColorGradients) {
                        that.addGradientColor(entry);
                    }
                });

            this.bindClickEventListener();
            this.addColorGroup()
                .style('opacity', 1);
        },

        /**
         * This method bind the "click" event listeners to a "person" element.
         */
        bindClickEventListener: function () {
            var personGroup = this.config.svg
                .select('g.personGroup')
                .selectAll('g.person')
                .data(this.config.nodes)
                .filter(function (d) {
                    return (d.data.xref !== '');
                })
                .classed('available', true);

            // Trigger method on click
            personGroup
                .on('click', $.proxy(this.personClick, this));
        },

        /**
         * Returns TRUE if the depth of the element is in the inner range. So labels should
         * be rendered along an arc path. Otherwise returns FALSE to indicate the element
         * is either the center one or an outer arc.
         *
         * @param {object} d D3 data object
         *
         * @return {bool}
         */
        isInnerLabel: function (d) {
            return ((d.depth > 0) && (d.depth < this.options.numberOfInnerCircles));
        },

        /**
         * Method triggers either the "update" or "individual" method on the click on an person.
         *
         * @param {object} d D3 data object
         */
        personClick: function (d) {
            // Trigger either "update" or "individual" method on click depending on person in chart
            (d.depth === 0) ? this.individual(d) : this.update(d);
        },

        /**
         * Helper method to execute callback method after all transitions are done
         * of a selection.
         *
         * @param {object}   transition D3 transition object
         * @param {function} callback   Callback method
         */
        endall: function (transition, callback) {
            var n = 0;

            transition
                .on('start', function() { ++n; })
                .on('end', function() {
                    if (!--n) {
                        callback.apply(transition);
                    }
                });
        },

        /**
         * Function is executed as callback after all transitions are done in update method.
         */
        updateDone: function () {
            // Remove arc if segments should be hidden
            if (this.options.hideEmptySegments) {
                this.config.svg
                    .selectAll('g.person.remove')
                    .selectAll('g.arc')
                    .remove();
            }

            var that = this;

            // Remove styles so CSS classes may work correct, Uses a small timer as animation seems not
            // to be done already if the point is reached
            var t = d3.timer(function () {
                that.config.svg
                    .selectAll('g.person g.arc path')
                    .attr('style', null);

                that.config.svg
                    .selectAll('g.person g.label')
                    .style('opacity', null);

                t.stop();
            }, 10);

            this.config.svg
                .selectAll('g.person.new, g.person.update, g.person.remove')
                .classed('new', false)
                .classed('update', false)
                .classed('remove', false)
                .selectAll('g.label.old, title.old')
                .remove();

            this.config.svg
                .selectAll('g.colorGroup:not(.new)')
                .remove();

            this.config.svg
                .selectAll('g.colorGroup.new')
                .classed('new', false);

            this.config.svg
                .selectAll('g.person.available')
                .classed('available', false);

            // Add click handler after all transitions are done
            this.bindClickEventListener();
        },

        /**
         * Update the chart with data loaded from AJAX.
         *
         * @param {object} d D3 data object
         */
        update: function (d) {
            var that = this;

            that.config.svg
                .selectAll('g.person')
                .on('click', null);

            d3.json(
                this.options.updateUrl + d.data.xref,
                function (data) {
                    // Initialize the new loaded data
                    that.initData(data);

                    // Flag all elements which are subject to change
                    that.config.svg
                        .selectAll('g.person')
                        .data(that.config.nodes)
                        .each(function (entry) {
                            var person = d3.select(this);

                            person.classed('remove', entry.data.xref === '')
                                .classed('update', (entry.data.xref !== '') && person.classed('available'))
                                .classed('new', (entry.data.xref !== '') && !person.classed('available'));

                            if (!person.classed('new')) {
                                person.selectAll('g.label, title')
                                    .classed('old', true);
                            }

                            that.addPersonData(person, entry);
                        });

                    // Hide all new labels of not removed elements
                    that.config.svg
                        .selectAll('g.person:not(.remove)')
                        .selectAll('g.label:not(.old)')
                        .style('opacity', 0);

                    that.addColorGroup()
                        .classed('new', true);

                    // Create transition instance
                    var t = d3.transition()
                        .duration(that.options.updateDuration)
                        .call(that.endall, function () { that.updateDone(); });

                    // Fade out old arc
                    that.config.svg
                        .selectAll('g.person.remove g.arc path')
                        .transition(t)
                        .style('fill', function () {
                            return that.options.hideEmptySegments ? null : 'rgb(240, 240, 240)';
                        })
                        .style('opacity', function () {
                            return that.options.hideEmptySegments ? 0 : null;
                        });

                    // Fade in new arcs
                    that.config.svg
                        .selectAll('g.person.new g.arc path')
                        .transition(t)
                        .style('fill', 'rgb(250, 250, 250)')
                        .style('opacity', function () {
                            return that.options.hideEmptySegments ? 1 : null;
                        });

                    // Fade out all old labels and color group
                    that.config.svg
                        .selectAll('g.person.update g.label.old, g.person.remove g.label.old, g.colorGroup:not(.new)')
                        .transition(t)
                        .style('opacity', 0);

                    // Fade in all new labels and color group
                    that.config.svg
                        .selectAll('g.person:not(.remove) g.label:not(.old), g.colorGroup.new')
                        .transition(t)
                        .style('opacity', 1);
                }
            );
        },

        /**
         * Redirect the current page the the individual page.
         *
         * @param {object} d D3 data object
         */
        individual: function (d) {
            window.location = this.options.individualUrl + d.data.xref;
        },

        /**
         * Get the relative position offsets in percent for different text lines (givenname, surname, dates).
         *   => (0 = inner radius, 100 = outer radius)
         *
         * @param {int}    index Index position of element in parent container. Required to create a unique path id.
         * @param {object} d     D3 data object
         *
         * @return {int}
         */
        getTextOffset: function(index, d) {
            // TODO
            return this.isPositionFlipped(d) ? [20, 35, 58, 81, 66][index] : [75, 60, 37, 14, 30][index];
        },

        /**
         * Truncates the text of the current element depending on its depth
         * in the chart.
         *
         * @param {object} d     D3 data object
         * @param {int}    index Index position of element in parent container
         *
         * @returns {string} Truncated text
         */
        truncate: function (d, index) {
            var that           = this;
            var availableWidth = this.getAvailableWidth(d, index);

            return function () {
                // Depending on the depth of an entry in the chart the available width differs
                var self       = d3.select(this);
                var textLength = self.node().getComputedTextLength();
                var text       = self.text();

                while ((textLength > availableWidth) && (text.length > 0)) {
                    // Remove last char
                    text = text.slice(0, -1);

                    // Recalculate the text width
                    textLength = self
                        .text(text + '...')
                        .node()
                        .getComputedTextLength();
                }
            };
        },

        /**
         * Calculate the available text width. Depending on the depth of an entry in
         * the chart the available width differs.
         *
         * @param {object} d     D3 data object
         * @param {int}    index Index position of element in parent container.
         *
         * @returns {int} Calculated available width
         */
        getAvailableWidth: function (d, index) {
            // Innermost circle (Reducing the width slightly, avoiding the text is sticking too close to the edge)
            let availableWidth = (this.options.centerCircleRadius * 2) - (this.options.centerCircleRadius * 0.15);

            if ((d.depth >= 1) && (d.depth < this.options.numberOfInnerCircles)) {
                // Calculate length of the arc
                availableWidth = this.arcLength(d, this.getTextOffset(index, d));
            } else {
                // Outer arcs
                if (d.depth >= this.options.numberOfInnerCircles) {
                    availableWidth = this.options.outerArcHeight;
                }
            }

            return availableWidth - (this.options.textPadding * 2);
        },

        /**
         * Get the first names of an person.
         *
         * @param {object} d D3 data object
         *
         * @return {string}
         */
        getFirstNames: function (d) {
            return d.data.name.substr(0, d.data.name.lastIndexOf(' '));
        },

        /**
         * Get the last name of an person.
         *
         * @param {object} d D3 data object
         *
         * @return {string}
         */
        getLastName: function (d) {
            return d.data.name.substr(d.data.name.lastIndexOf(' ') + 1);
        },

        /**
         * Get the time span label of an person. Returns null if label
         * should not be displayed due empty data.
         *
         * @param {object} d D3 data object
         *
         * @return {string}
         */
        getTimeSpan: function (d) {
            let age;
            if (d.data.born || d.data.died) {
                if (d.data.born && d.data.died) {
                    age = Number(d.data.died) - Number(d.data.born);
                    age = ' : ' + age + ' ans';
                }
                else age = '';
                //
                return d.data.born + '-' + d.data.died + ' ' + age;
            }

            return null;
        },

        /**
         * Get if bitrhdate's media, deatdate's media and weddingdate's media is present of an person. Returns '  ' if label
         * should not be displayed due empty data.
         *
         * @param {object} d D3 data object
         *
         * @return {string}
         */
        getObjectFind: function (d) {
            return d.data.mediaborn + ' ' + d.data.mediamarr + ' ' + d.data.mediadied;
        },

        /**
         * Get the scaled font size.
         *
         * @param {object} d D3 data object
         *
         * @return {string}
         */
        getFontSize: function (d) {
            var fontSize = this.options.fontSize;

            if (d.depth >= (this.options.numberOfInnerCircles + 1)) {
                fontSize += 1;
            }

            return ((fontSize - d.depth) * this.options.fontScale / 100.0) + 'px';
        },

        /**
         * Check for the 360 degree chart if the current arc labels
         * should be flipped for easier reading.
         *
         * @param {object} d D3 data object
         *
         * @return {boolean}
         */
        isPositionFlipped: function (d) {
            if ((this.options.fanDegree !== 360) || (d.depth <= 1)) {
                return false;
            }

            var sAngle = this.startAngle(d);
            var eAngle = this.endAngle(d);

            // Flip names for better readability depending on position in chart
            return ((sAngle >= (90 * Math.PI / 180)) && (eAngle <= (180 * Math.PI / 180)))
                || ((sAngle >= (-180 * Math.PI / 180)) && (eAngle <= (-90 * Math.PI / 180)));
        },

        /**
         * Append a path element to the given parent group element.
         *
         * @param {object} label Parent container element, D3 group element
         * @param {int}    index Index position of element in parent container. Required to create a unique path id.
         * @param {object} d     D3 data object
         *
         * @return {string} Path id
         */
        appendPathToLabel: function (label, index, d)
        {
            var that     = this;
            var personId = d3.select(label.node().parentNode).attr('id');
            var pathId   = "path-" + personId + "-" + index;

            // If definition already exists return the existing path id
            if (this.config.svgDefs.select("path#" + pathId).node()) {
                return pathId;
            }

            // Create arc generator for path segments
            var arcGenerator = d3.arc()
                .startAngle(function () {
                    return that.isPositionFlipped(d)
                        ? that.endAngle(d)
                        : that.startAngle(d);
                })
                .endAngle(function () {
                    return that.isPositionFlipped(d)
                        ? that.startAngle(d)
                        : that.endAngle(d);
                })
                .innerRadius(function () {
                    return that.relativeRadius(d, that.getTextOffset(index, d));
                })
                .outerRadius(function () {
                    return that.relativeRadius(d, that.getTextOffset(index, d));
                });

            this.config.svgDefs
                .append("path")
                .attr("id", pathId)
                .attr("d", arcGenerator);

            return pathId;
        },

        /**
         * Append "textPath" element.
         *
         * @param {object} parent  Parent element used to append the "textPath" element
         * @param {string} refId  Id of reference element
         * @param {string} text   Text to display
         *
         * @return {object} D3 textPath object
         */
        appendTextPathToText: function (parent, refId, text) {
            return parent.append('textPath')
                .attr('xlink:href', function () {
                    return '#' + refId;
                })
                .attr('startOffset', '25%')
                .text(text);
        },

        /**
         * Append text element to the given group element.
         *
         * @param {object} d         D3 data object
         * @param {int}    index     Index position of element in parent container
         * @param {object} group     D3 group (g) object
         * @param {string} label     Label to display
         * @param {string} textClass Optional class to set to the D3 text element
         *
         * @return {object} D3 text object
         */
        appendOuterArcText: function (d, index, group, label, textClass) {
            var that        = this;
            var textElement = group.append('text');

            textElement.attr('class', textClass || null)
                .attr('dominant-baseline', 'middle')
                .style('font-size', function () {
                    return that.getFontSize(d);
                })
                .text(label)
                .each(this.truncate(d, index));

            return textElement;
        },

        /**
         * Transform the D3 text elements in the group. Rotate each text element
         * depending on its offset, so that they are equally positioned inside
         * the arc.
         *
         * @param {object} label D3 label group object
         * @param {object} d     D3 data object
         *
         * @return {void}
         */
        transformOuterText: function (label, d) {
            var that          = this;
            var textElements  = label.selectAll('text');
            var countElements = textElements.size();

            textElements.each(function (ignore, i) {
                var offsets = [0, -0.025, 0.5, 1.15, 2.0];
                var offset  = offsets[countElements];

                var mapIndexToOffset = d3.scaleLinear()
                    .domain([0, countElements - 1])
                    .range([-offset, offset]);

                // Slightly increase in the y axis' value so the texts may not overlay
                var offsetRotate = (i <= 1 ? 1.25 : 1.75);

                if ((d.depth === 0) || (d.depth === 6)) {
                    offsetRotate = 1.0;
                }

                if (d.depth === 7) {
                    offsetRotate = 0.75;
                }

                if (d.depth === 8) {
                    offsetRotate = 0.5;
                }

                offsetRotate *= that.options.fontScale / 100.0;

                // Name of center person should not be rotated in any way
                if (d.depth === 0) {
                    d3.select(this).attr('dy', (mapIndexToOffset(i) * offsetRotate) + 'em');
                } else {
                    d3.select(this).attr('transform', function () {
                        var dx        = d.x1 - d.x0;
                        var angle     = that.options.x(d.x0 + (dx / 2)) * 180 / Math.PI;
                        var rotate    = angle - (mapIndexToOffset(i) * offsetRotate * (angle > 0 ? -1 : 1));
                        var translate = (that.centerRadius(d) - (that.options.colorArcWidth / 2.0));

                        if (angle > 0) {
                            rotate -= 90;
                        } else {
                            translate = -translate;
                            rotate += 90;
                        }

                        return 'rotate(' + rotate + ') translate(' + translate + ')';
                    });
                }
            });
        }
    });
}(jQuery));
