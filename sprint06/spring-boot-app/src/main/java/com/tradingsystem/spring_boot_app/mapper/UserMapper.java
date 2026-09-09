package com.tradingsystem.spring_boot_app.mapper;

import com.tradingsystem.domain.entities.User;
import com.tradingsystem.domain.enums.UserStatus;
import org.apache.ibatis.annotations.*;

import java.util.List;
import java.util.Optional;

/**
 * MyBatis mapper for User entity.
 * All parameters are bound as JDBC bind parameters to prevent SQL injection.
 */
@Mapper
public interface UserMapper {
    
    /**
     * Inserts a new user record.
     * @param user the user to insert
     * @return number of rows affected
     */
    @Insert("""
        INSERT INTO users (first_name, last_name, email, phone, password_hash, status, created_at, updated_at)
        VALUES (#{user.firstName}, #{user.lastName}, #{user.email}, #{user.phone}, #{user.passwordHash}, #{user.status}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        """)
    @Options(useGeneratedKeys = true, keyProperty = "user.userId")
    int insertUser(@Param("user") User user);
    
    /**
     * Selects a user by user ID.
     * @param userId the user ID to search for (bound parameter)
     * @return the user, or empty if not found
     */
    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE user_id = #{userId}
        """)
    @Results({
        @Result(property = "userId", column = "user_id"),
        @Result(property = "firstName", column = "first_name"),
        @Result(property = "lastName", column = "last_name"),
        @Result(property = "passwordHash", column = "password_hash")
    })
    Optional<User> findUserById(@Param("userId") Long userId);
    
    /**
     * Selects a user by email address.
     * @param email the email to search for (bound parameter)
     * @return the user, or empty if not found
     */
    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE email = #{email}
        """)
    @Results({
        @Result(property = "userId", column = "user_id"),
        @Result(property = "firstName", column = "first_name"),
        @Result(property = "lastName", column = "last_name"),
        @Result(property = "passwordHash", column = "password_hash")
    })
    Optional<User> findUserByEmail(@Param("email") String email);
    
    /**
     * Selects all users with a given status.
     * @param status the status filter (bound parameter)
     * @return list of users matching the status
     */
    @Select("""
        SELECT user_id, first_name, last_name, email, phone, password_hash, status
        FROM users
        WHERE status = #{status}
        ORDER BY user_id
        """)
    @Results({
        @Result(property = "userId", column = "user_id"),
        @Result(property = "firstName", column = "first_name"),
        @Result(property = "lastName", column = "last_name"),
        @Result(property = "passwordHash", column = "password_hash")
    })
    List<User> findUsersByStatus(@Param("status") UserStatus status);
    
    /**
     * Updates a user's status.
     * @param userId the user ID (bound parameter)
     * @param status the new status (bound parameter)
     * @return number of rows affected
     */
    @Update("""
        UPDATE users
        SET status = #{status}, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = #{userId}
        """)
    int updateUserStatus(@Param("userId") Long userId, @Param("status") UserStatus status);
    
    /**
     * Deletes a user by ID.
     * @param userId the user ID to delete (bound parameter)
     * @return number of rows affected
     */
    @Delete("""
        DELETE FROM users
        WHERE user_id = #{userId}
        """)
    int deleteUser(@Param("userId") Long userId);
    
    /**
     * Counts total users.
     * @return the count of users
     */
    @Select("SELECT COUNT(*) FROM users")
    int countUsers();
}
