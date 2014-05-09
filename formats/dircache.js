"use strict";
define(['utils/misc_utils', 'utils/file_utils'], function(miscUtils, fileUtils) {
    var HEADER_VER_OFFSET = 4;
    var HEADER_ENTRIES_COUNT_OFFSET = HEADER_VER_OFFSET + 4;
    var FIRST_ENTRY_OFFSET = HEADER_ENTRIES_COUNT_OFFSET + 4;
    var ENTRY_OFFSET_TO_SHA = 4 * 10; //10 32bit fields
    
    // This object parses the data contained in the git dircache, aka .git/index file
    var Dircache = function(buf) {
    	var data = new DataView(buf);
        var uv8 = new Uint8Array(buf);
    	this.data = data;
    	
        //check magic number...
        if ("DIRC" !== getASCIIChars(data, 4)) {
            console.error("INVALID Dircache file");
            throw new Error("INVALID Dircache file");
        }
    	var versionNum = data.getUint32(HEADER_VER_OFFSET);
        var entriesCount = data.getUint32(HEADER_ENTRIES_COUNT_OFFSET);
        console.log("Dircache ver:"+versionNum+" entries:"+entriesCount);
        
        var FIRST_ENTRY_OFFSET = 12;
        var entries = {}; //map entry path to entry data obj
        var nextOffset = FIRST_ENTRY_OFFSET;
        var entry = {};
        for (var i=0; i < entriesCount; i++) {
            nextOffset = readEntry(data, uv8, nextOffset, entry);
            entries[entry.path] = entry;
            entry = {};
        }
        
        this.getEntry = function(path) {
            return entries[path];
        };
        
        this.entriesCount = function() {
            return entriesCount;
        };
        
        this.addEntry = function(path, sha, modTime, size) {
            if (!entries[path]) {
                entriesCount++;
            }
            entries[path] = {
                sha: sha,
                path: path,
                modTime : modTime,
                size : size
            };
        };
        
        /**
         * @return an Array of entries in Git sort order
         */
        this.getSortedEntryPaths = function() {
            var entryPathsSorted = Object.keys(entries);
            //first sort entries per Git index sort order
            return entryPathsSorted.sort();
        };
        
        /**
         * @return ArayBuffer with dircache formated to binary format expected by Git as per
         *   http://code.google.com/p/git-core/source/browse/Documentation/technical/index-format.txt
         */
        this.getBinFormat = function() {
            var header = createFileHeader(entries.length);
            var binEntries = entries.map(createEntry);
            var entriesSize = binEntries.reduce(function(prevVal, currVal){
                return prevVal + currVal.length;
            });
            var res = new Uint8Array(header.length + entriesSize);
            var offset = 0;
            
            var sortedEntryPaths = this.getSortedEntryPaths();
            
            binEntries.forEach(function(val) {
                res.set(val, offset);
                offset += val.length;
            })
        }
    };  

    function compareShas(sha1, sha2){
         // assume the first byte has been matched in the fan out table
        for (var i = 1; i < 20; i++){
            if (sha1[i] != sha2[i]){
                return sha1[i] - sha2[i];
            }
        }
        return 0;
    }
    
    function getShaAtIndex(uv8, byteOffset){
        return uv8.subarray(byteOffset, byteOffset + 20); 
    }
    
    /**
     * @return string, each byte being read out as 1 char
     */
    function getASCIIChars(dataView, count) {
        var str = "";
        for (var i=0; i < count; i++) {
            str += String.fromCharCode(dataView.getUint8(i));
        }
        return str;
    }
    
    /**
     * @return String, null termindated string read from dataView, not inc the null char
     */
    function readNullTermString(dataView, offset) {
        var str = "";
        var count = 0;
        var c = dataView.getUint8(offset)
        while (c != 0) {
            str += String.fromCharCode(c);
            c = dataView.getUint8(offset+(++count));
        }
        return str;
    }
    
    /**
     * @return Number, the number of padding nulls required as per the Git Index file spec
     */
    function numberOfPaddingNulls(entrySize) {
        return 8 - (entrySize % 8); //allow for upto 8 padding nulls
    }
    
    /**
     * will populate the passed in entry object with props for the reaad entry, props are:
     * sha (String), path (String), modTime (Date), size (Number)
     * returns the new offset
     */
    function readEntry(dataView, uint8Arr, offset, entry) {
        var FILE_SIZE_OFFSET = offset + (4 * 9); //10th 32bit field
        var SHA_OFFSET = FILE_SIZE_OFFSET + 4;
        var FLAGS_V2_OFFSET = SHA_OFFSET + 20; //160 bits for sha1 
        var PATH_OFFSET = SHA_OFFSET + 20 + 2; //16bits for flags field in v2

        var ctime = dataView.getUint32(offset);
        var mtime = dataView.getUint32(offset+8);
        var time = ctime > mtime ? ctime : mtime;
        entry.modTime = new Date(time * 1000);
        entry.size = dataView.getUint32(FILE_SIZE_OFFSET);
        entry.sha = miscUtils.convertBytesToSha(getShaAtIndex(uint8Arr, SHA_OFFSET));
        entry.path = readNullTermString(dataView, PATH_OFFSET);
        var entrySize = (PATH_OFFSET - offset);
        var padding = numberOfPaddingNulls(entrySize + entry.path.length);
        var nextEntryOffset = entry.path.length + padding;
        return PATH_OFFSET + nextEntryOffset;
    }
    
    // given a entry JS obj, return a uint8Array for the entry in format for index file
    // entry is expected to have the props:
    // path, sha, size, modDate 
    function createEntry(entry) {
        //10 32b stat-fields, 20 for 160bit SHA,2 for 16b flags
        var size = (10 * 4) + 20 + 2 + entry.path.length + 1;
        var nullExtras = size % 8;
        size += nullExtras;
        var dv = new DataView(new Uint8Array(size).buffer);
        dv.setUint32()
        return dv.buffer;
    }
    
    function createFileHeader(entryCount) {
        var headerDV = new DataView(new ArraUint8Array(12).buffer);
        headerDV.setUint32(0, 1145655875);// "DIRC" as first 4 bytes in ascii
        headerDV.setUint32(4, 2);
        headerDV.setUint32(8, entryCount || 0);
        return headerDV;
    }
    
    // RETURN for this module
    return Dircache;
});