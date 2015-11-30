/*
Copyright 2015 OpenMarket Ltd

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

'use strict';
var React = require("react");
var ReactDOM = require("react-dom");
var GeminiScrollbar = require('react-gemini-scrollbar');
var MatrixClientPeg = require("../../../MatrixClientPeg");
var RoomListSorter = require("../../../RoomListSorter");
var dis = require("../../../dispatcher");
var sdk = require('../../../index');

var HIDE_CONFERENCE_CHANS = true;

module.exports = React.createClass({
    displayName: 'RoomList',

    propTypes: {
        ConferenceHandler: React.PropTypes.any, // e.g. VectorConferenceHandler
        collapsed: React.PropTypes.bool,
        currentRoom: React.PropTypes.string
    },

    getInitialState: function() {
        return {
            activityMap: null,
            lists: {},
        }
    },

    componentWillMount: function() {
        var cli = MatrixClientPeg.get();
        cli.on("Room", this.onRoom);
        cli.on("Room.timeline", this.onRoomTimeline);
        cli.on("Room.name", this.onRoomName);
        cli.on("Room.tags", this.onRoomTags);
        cli.on("RoomState.events", this.onRoomStateEvents);
        cli.on("RoomMember.name", this.onRoomMemberName);

        var s = this.getRoomLists();
        s.activityMap = {};
        this.setState(s);
    },

    componentDidMount: function() {
        this.dispatcherRef = dis.register(this.onAction);
    },

    onAction: function(payload) {
        switch (payload.action) {
            case 'view_tooltip':
                this.tooltip = payload.tooltip;
                this._repositionTooltip();
                if (this.tooltip) this.tooltip.style.display = 'block';
                break
        }
    },

    componentWillUnmount: function() {
        dis.unregister(this.dispatcherRef);
        if (MatrixClientPeg.get()) {
            MatrixClientPeg.get().removeListener("Room", this.onRoom);
            MatrixClientPeg.get().removeListener("Room.timeline", this.onRoomTimeline);
            MatrixClientPeg.get().removeListener("Room.name", this.onRoomName);
            MatrixClientPeg.get().removeListener("RoomState.events", this.onRoomStateEvents);
        }
    },

    componentWillReceiveProps: function(newProps) {
        this.state.activityMap[newProps.selectedRoom] = undefined;
        this.setState({
            activityMap: this.state.activityMap
        });
    },

    onRoom: function(room) {
        this.refreshRoomList();
    },

    onRoomTimeline: function(ev, room, toStartOfTimeline) {
        if (toStartOfTimeline) return;

        var hl = 0;
        if (
            room.roomId != this.props.selectedRoom &&
            ev.getSender() != MatrixClientPeg.get().credentials.userId)
        {
            // don't mark rooms as unread for just member changes
            if (ev.getType() != "m.room.member") {
                hl = 1;
            }

            var actions = MatrixClientPeg.get().getPushActionsForEvent(ev);
            if (actions && actions.tweaks && actions.tweaks.highlight) {
                hl = 2;
            }
        }

        if (hl > 0) {
            var newState = this.getRoomLists();

            // obviously this won't deep copy but this shouldn't be necessary
            var amap = this.state.activityMap;
            amap[room.roomId] = Math.max(amap[room.roomId] || 0, hl);

            newState.activityMap = amap;

            this.setState(newState);
        }
    },

    onRoomName: function(room) {
        this.refreshRoomList();
    },

    onRoomTags: function(event, room) {
        this.refreshRoomList();        
    },

    onRoomStateEvents: function(ev, state) {
        setTimeout(this.refreshRoomList, 0);
    },

    onRoomMemberName: function(ev, member) {
        setTimeout(this.refreshRoomList, 0);
    },

    refreshRoomList: function() {
        // TODO: rather than bluntly regenerating and re-sorting everything
        // every time we see any kind of room change from the JS SDK
        // we could do incremental updates on our copy of the state
        // based on the room which has actually changed.  This would stop
        // us re-rendering all the sublists every time anything changes anywhere
        // in the state of the client.
        this.setState(this.getRoomLists());
    },

    getRoomLists: function() {
        var self = this;
        var s = { lists: {} };

        s.lists["m.invite"] = [];
        s.lists["m.favourite"] = [];
        s.lists["m.recent"] = [];
        s.lists["m.lowpriority"] = [];
        s.lists["m.archived"] = [];

        MatrixClientPeg.get().getRooms().forEach(function(room) {
            var me = room.getMember(MatrixClientPeg.get().credentials.userId);

            if (me && me.membership == "invite") {
                s.lists["m.invite"].push(room);
            }
            else {
                var shouldShowRoom =  (
                    me && (me.membership == "join")
                );

                // hiding conf rooms only ever toggles shouldShowRoom to false
                if (shouldShowRoom && HIDE_CONFERENCE_CHANS) {
                    // we want to hide the 1:1 conf<->user room and not the group chat
                    var joinedMembers = room.getJoinedMembers();
                    if (joinedMembers.length === 2) {
                        var otherMember = joinedMembers.filter(function(m) {
                            return m.userId !== me.userId
                        })[0];
                        var ConfHandler = self.props.ConferenceHandler;
                        if (ConfHandler && ConfHandler.isConferenceUser(otherMember)) {
                            // console.log("Hiding conference 1:1 room %s", room.roomId);
                            shouldShowRoom = false;
                        }
                    }
                }

                if (shouldShowRoom) {
                    var tagNames = Object.keys(room.tags);
                    if (tagNames.length) {
                        for (var i = 0; i < tagNames.length; i++) {
                            var tagName = tagNames[i];
                            s.lists[tagName] = s.lists[tagName] || [];
                            s.lists[tagNames[i]].push(room);
                        }
                    }
                    else {
                        s.lists["m.recent"].push(room); 
                    }
                }
            }
        });

        //console.log("calculated new roomLists; m.recent = " + s.lists["m.recent"]);

        // we actually apply the sorting to this when receiving the prop in RoomSubLists.

        return s;
    },

    _repositionTooltip: function(e) {
        if (this.tooltip && this.tooltip.parentElement) {
            var scroll = ReactDOM.findDOMNode(this);
            this.tooltip.style.top = (scroll.parentElement.offsetTop + this.tooltip.parentElement.offsetTop - scroll.children[2].scrollTop) + "px"; 
        }
    },

    onShowClick: function() {
        dis.dispatch({
            action: 'show_left_panel',
        });
    },

    render: function() {
        var expandButton = this.props.collapsed ? 
                           <img className="mx_RoomList_expandButton" onClick={ this.onShowClick } src="img/menu.png" width="20" alt=">"/> :
                           null;

        var RoomSubList = sdk.getComponent('organisms.RoomSubList');
        var self = this;

        return (
            <GeminiScrollbar className="mx_RoomList_scrollbar" autoshow={true} onScroll={self._repositionTooltip}>
            <div className="mx_RoomList">
                { expandButton }

                <RoomSubList list={ self.state.lists['m.invite'] }
                             label="Invites"
                             editable={ false }
                             order="recent"
                             activityMap={ self.state.activityMap }
                             selectedRoom={ self.props.selectedRoom }
                             collapsed={ self.props.collapsed } />

                <RoomSubList list={ self.state.lists['m.favourite'] }
                             label="Favourites"
                             tagName="m.favourite"
                             verb="favourite"
                             editable={ true }
                             order="manual"
                             activityMap={ self.state.activityMap }
                             selectedRoom={ self.props.selectedRoom }
                             collapsed={ self.props.collapsed } />

                <RoomSubList list={ self.state.lists['m.recent'] }
                             label="Conversations"
                             editable={ true }
                             verb="restore"
                             order="recent"
                             activityMap={ self.state.activityMap }
                             selectedRoom={ self.props.selectedRoom }
                             collapsed={ self.props.collapsed } />

                { Object.keys(self.state.lists).map(function(tagName) {
                    if (!tagName.match(/^m\.(invite|favourite|recent|lowpriority|archived)$/)) {
                        return <RoomSubList list={ self.state.lists[tagName] }
                             key={ tagName }
                             label={ tagName }
                             tagName={ tagName }
                             verb={ "tag as " + tagName }
                             editable={ true }
                             order="manual"
                             activityMap={ self.state.activityMap }
                             selectedRoom={ self.props.selectedRoom }
                             collapsed={ self.props.collapsed } />

                    }
                }) }

                <RoomSubList list={ self.state.lists['m.lowpriority'] }
                             label="Low priority"
                             tagName="m.lowpriority"
                             verb="demote"
                             editable={ true }
                             order="recent"
                             bottommost={ self.state.lists['m.archived'].length === 0 }
                             activityMap={ self.state.activityMap }
                             selectedRoom={ self.props.selectedRoom }
                             collapsed={ self.props.collapsed } />

                <RoomSubList list={ self.state.lists['m.archived'] }
                             label="Historical"
                             editable={ false }
                             order="recent"
                             bottommost={ true }
                             activityMap={ self.state.activityMap }
                             selectedRoom={ self.props.selectedRoom }
                             collapsed={ self.props.collapsed } />
            </div>
            </GeminiScrollbar>
        );
    }
});